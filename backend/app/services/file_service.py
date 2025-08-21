import uuid
from typing import List

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.models.base import User
from app.repositories.file_repository import (
    create_file,
    get_category_id_by_slug,
    get_category_name_by_id,
    get_file_by_id,
    get_filtered_files,
    search_files,
)
from app.repositories.tag_repository import get_or_create_tags, get_tag_names_by_ids
from app.schemas.file_schemas import FileCreate, FileResponse
from app.services.s3_service import create_image_thumbnail, create_video_thumbnail


def upload_file_to_s3(file: UploadFile, key: str):
    from app.main import logger

    s3_client = boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )
    try:
        logger.info("test")
        s3_client.upload_fileobj(file.file, settings.AWS_S3_BUCKET_NAME, key)
    except ClientError as e:
        logger.info(e)
        raise HTTPException(status_code=500, detail=f"Failed to upload to S3: {e}")


def generate_key(filename: str):
    return f"uploads/{uuid.uuid4()}_{filename}"


def save_file_metadata(
    file: UploadFile,
    description: str | None,
    tag_names: str,
    category_slug: str,
    owner: User,
):
    key = generate_key(file.filename)

    # Читаем содержимое файла до загрузки
    file_content = file.file.read()
    file.file.seek(0)  # Сбрасываем указатель файла

    # Загружаем файл на S3
    upload_file_to_s3(file, key)

    if not owner:
        raise HTTPException(status_code=401, detail=f"Do not authorized")

    tag_names_list = [tag.strip() for tag in tag_names.split(",") if tag.strip()]
    tag_names_list = list(set(tag_names_list))
    tag_ids = get_or_create_tags(tag_names_list)
    category_id = get_category_id_by_slug(category_slug)

    # Создаем превью в зависимости от типа файла
    thumbnail_key = None
    if file.content_type.startswith("image/"):
        thumbnail_key = create_image_thumbnail(file_content, file.content_type, key)
    elif file.content_type.startswith("video/"):
        thumbnail_key = create_video_thumbnail(file_content, key)

    file_create = FileCreate(
        original_name=file.filename,
        mime_type=file.content_type,
        description=description,
        tags=tag_ids,
        file_path=key,
        size=file.size,
        owner_id=owner.id,
        category_id=category_id,
        thumbnail_path=thumbnail_key,
    )

    db_file = create_file(file_create)
    db_file.tags_name = get_tag_names_by_ids(db_file.tags)
    db_file.category_name = get_category_name_by_id(db_file.category_id)

    return db_file


def get_file_service(file_id: str):
    file = get_file_by_id(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    file.tags_name = get_tag_names_by_ids(file.tags)
    file.category_name = get_category_name_by_id(file.category_id)
    return file


def get_files_list(
    category: str, sort_by: str, sort_order: str, page: int, limit: int, user_id: str
):
    offset = (page - 1) * limit
    sort_field_map = {"date": "created_at", "name": "original_name", "size": "size"}
    sort_column = sort_field_map.get(sort_by, "created_at")
    order = "desc" if sort_order == "desc" else "asc"

    files, total = get_filtered_files(
        category=category,
        sort_column=sort_column,
        order=order,
        limit=limit,
        offset=offset,
        user_id=user_id,
    )

    for file in files:
        file.tags_name = get_tag_names_by_ids(file.tags)
        file.category_name = get_category_name_by_id(file.category_id)

    return {
        "files": [FileResponse.model_validate(f) for f in files],
        "total": total,
        "page": page,
        "limit": limit,
    }


def search_files_service(
    query: str = None,
    category: str | None = None,
    include_tags: List[str] = None,
    exclude_tags: List[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    limit: int = 20,
    user_id: str = None,
) -> dict:
    """
    Выполняет поиск файлов через репозиторий.
    """
    sort_field_map = {"date": "created_at", "name": "original_name", "size": "size"}
    sort_column = sort_field_map.get(sort_by, "created_at")

    files, total = search_files(
        query=query,
        category=category,
        include_tags=include_tags,
        exclude_tags=exclude_tags,
        sort_by=sort_column,
        sort_order=sort_order,
        page=page,
        limit=limit,
        user_id=user_id,
    )

    # Добавляем метаданные (tags_name, category_name)
    for file in files:
        file.tags_name = get_tag_names_by_ids(file.tags)
        file.category_name = get_category_name_by_id(file.category_id)

    return {
        "files": [FileResponse.model_validate(f) for f in files],
        "total": total,
        "page": page,
        "limit": limit,
    }


def update_file_metadata(
    file_id: str,
    description: str | None,
    tag_names: str,
    category: str,
    user_id: str,
):
    """
    Обновление метаданных файла
    """

    from app.models.base import File
    from app.core.database import get_db_session
    from datetime import datetime, timezone
    
    with get_db_session() as db:
        try:
            # Получаем файл
            db_file = db.query(File).filter(File.id == file_id, File.owner_id == user_id).first()
            if not db_file:
                raise Exception("File not found or access denied")
            
            # Обновляем описание
            if description is not None:
                db_file.description = description
            
            # Обновляем категорию
            category_mapping = {
                "0+": "0-plus",
                "16+": "16-plus", 
                "18+": "18-plus"
            }
            db_file.category_id = get_category_id_by_slug(category_mapping.get(category, "0-plus"))
            
            # Обновляем теги
            if tag_names:
                tag_name_list = [name.strip() for name in tag_names.split(",") if name.strip()]
                tag_name_list = list(set(tag_name_list))
                db_file.tags = get_or_create_tags(tag_name_list)

            db_file.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(db_file)

            db_file.tags_name = get_tag_names_by_ids(db_file.tags)
            db_file.category_name = get_category_name_by_id(db_file.category_id)
            
            return db_file
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
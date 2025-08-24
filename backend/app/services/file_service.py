import re
import uuid
from typing import List

from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.core.database import s3_client
from app.models.base import File, User
from app.repositories.file_repository import (
    create_file,
    delete_file_from_db,
    get_category_id_by_slug,
    get_category_name_by_id,
    get_file_by_id,
    get_filtered_files,
    search_files,
    update_file,
)
from app.repositories.s3_repository import upload_file_to_s3
from app.repositories.tag_repository import get_or_create_tags, get_tag_names_by_ids
from app.schemas.file_schemas import FileCreate, FileResponse
from app.services.s3_service import create_thumbnail_from_s3

SORT_FIELD_MAP = {"date": "created_at", "name": "original_name", "size": "size"}


def generate_key(filename: str) -> str:
    return f"uploads/{uuid.uuid4()}_{filename}"


def save_file_metadata(
    file: UploadFile,
    description: str | None,
    tag_names: str,
    category_slug: str,
    owner: User,
) -> FileResponse:
    if not owner:
        raise HTTPException(status_code=401, detail="Not authorized")

    key = generate_key(file.filename)
    file.file.seek(0)

    # Загружаем файл на S3 ПЕРЕД обработкой
    upload_file_to_s3(file, key)
    
    # Перемещаем указатель в начало для повторного чтения (если нужно)

    tag_names_list = [tag.strip() for tag in tag_names.split(",") if tag.strip()]
    tag_names_list = list(set(tag_names_list))
    tag_ids = get_or_create_tags(tag_names_list)
    category_id = get_category_id_by_slug(category_slug)

    thumbnail_key = None
    # Для создания превью скачайте файл с S3 или используйте отдельный поток
    if file.content_type.startswith("image/") or file.content_type.startswith("video/"):
        # Создайте превью отдельно, не загружая весь файл в память
        thumbnail_key = create_thumbnail_from_s3(key, file.content_type)

    print(thumbnail_key)

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

    file_record = create_file(file_create)
    file_record = FileMetadataService.enrich_file_metadata(file_record)
    return FileResponse.model_validate(file_record)


def get_file_service(file_id: str):
    file = get_file_by_id(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    file = FileMetadataService.enrich_file_metadata(file)
    return file


def get_files_list(
    category: str, sort_by: str, sort_order: str, page: int, limit: int, user_id: str
):
    offset = (page - 1) * limit
    sort_column = SORT_FIELD_MAP.get(sort_by, "created_at")
    order = "desc" if sort_order == "desc" else "asc"

    files, total = get_filtered_files(
        category=category,
        sort_column=sort_column,
        order=order,
        limit=limit,
        offset=offset,
        user_id=user_id,
    )

    files = FileMetadataService.enrich_files_batch(files)

    return {
        "files": [FileResponse.model_validate(f) for f in files],
        "total": total,
        "page": page,
        "limit": limit,
    }


def search_files_service(
    query: str = None,
    category: str | None = None,
    include_tags: str = None,
    exclude_tags: str = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    limit: int = 20,
    user_id: str = None,
) -> dict:
    """Выполняет поиск файлов через репозиторий."""
    # Парсим теги
    include_tags = [t.strip() for t in include_tags.split(",") if t.strip()]
    exclude_tags = [t.strip() for t in exclude_tags.split(",") if t.strip()]

    sort_column = SORT_FIELD_MAP.get(sort_by, "created_at")

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
    files = FileMetadataService.enrich_files_batch(files)

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
    """Обновление метаданных файла"""
    db_file = update_file(file_id, description, tag_names, category, user_id)
    db_file = FileMetadataService.enrich_file_metadata(db_file)
    return db_file


def delete_file_service(file_id: str, user_id: str) -> dict:
    """Сервис удаления файла"""
    try:
        # Получаем файл для проверки прав доступа
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        if file.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Удаляем файлы из S3
        FileStorageService.delete_file_from_s3(file)

        # Удаляем запись из базы данных
        delete_file_from_db(file_id)

        return {"message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def stream_file_service(file_id: str, range_header: str, user_id: str) -> dict:
    """Сервис стриминга файла"""
    try:
        # Получаем метаданные файла
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")

        # Проверяем права доступа
        if file.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Получаем размер файла из S3
        try:
            file_head = s3_client.head_object(
                Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.file_path
            )
            file_size = file_head.get("ContentLength", file.size)
        except:
            file_size = file.size

        # Обработка Range запросов
        start, end = 0, file_size - 1
        status_code = 200
        headers = {}
        s3_range = None

        if range_header:
            # Парсим Range заголовок (например, "bytes=0-1023")
            range_match = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if range_match:
                start_str, end_str = range_match.groups()
                start = int(start_str) if start_str else 0
                end = int(end_str) if end_str else file_size - 1
                end = min(end, file_size - 1)

                if start >= file_size:
                    raise HTTPException(
                        status_code=416, detail="Requested Range Not Satisfiable"
                    )

                status_code = 206
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
                s3_range = f"bytes={start}-{end}"

        # Запрашиваем файл из S3 (с Range или без)
        s3_params = {"Bucket": settings.AWS_S3_BUCKET_NAME, "Key": file.file_path}

        if s3_range:
            s3_params["Range"] = s3_range

        s3_response = s3_client.get_object(**s3_params)

        return {
            "s3_response": s3_response,
            "file": file,
            "start": start,
            "end": end,
            "status_code": status_code,
            "headers": headers,
            "file_size": file_size,
        }

    except ClientError as e:
        print(e)
        error_msg = f"S3 Client Error for file {file_id}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException as e:
        # Пробрасываем HTTP исключения без изменений
        raise
    except Exception as e:
        print(e)
        error_msg = f"Unexpected error streaming file {file_id}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)


def download_file_service(file_id: str, user_id: str) -> dict:
    """Сервис скачивания файла"""
    try:
        # Получаем файл для проверки прав доступа
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        if file.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Получаем файл из S3
        try:
            s3_response = s3_client.get_object(
                Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.file_path
            )

            return {"s3_response": s3_response, "file": file}
        except ClientError as e:
            raise HTTPException(status_code=404, detail="File not found in storage")

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class FileMetadataService:
    @staticmethod
    def enrich_file_metadata(file: File) -> File:
        """Обогащает файл метаданными"""
        file.tags_name = get_tag_names_by_ids(file.tags)
        file.category_name = get_category_name_by_id(file.category_id)
        return file

    @staticmethod
    def enrich_files_batch(files: List[File]) -> List[File]:
        """Обогащает список файлов метаданными"""
        if not files:
            return files

        for file in files:
            FileMetadataService.enrich_file_metadata(file)
        return files


class FileStorageService:
    @staticmethod
    def delete_file_from_s3(file: File) -> None:
        """Удаление всех связанных файлов из S3"""
        # Удаляем основной файл
        try:
            s3_client.delete_object(
                Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.file_path
            )
        except ClientError as e:
            # Логируем ошибку, но не прерываем процесс удаления
            print(f"Failed to delete main file from S3: {str(e)}")

        # Удаляем превью, если оно существует
        if file.preview_path:
            try:
                s3_client.delete_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.preview_path
                )
            except ClientError as e:
                print(f"Failed to delete preview from S3: {str(e)}")

        # Удаляем миниатюру, если она существует
        if file.thumbnail_path:
            try:
                s3_client.delete_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.thumbnail_path
                )
            except ClientError as e:
                print(f"Failed to delete thumbnail from S3: {str(e)}")

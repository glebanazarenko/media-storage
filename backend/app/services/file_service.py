import re
import ffmpeg
import uuid
from typing import List
from urllib.parse import quote

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
from app.services.group_service import _check_user_can_read_file, _check_user_can_edit_file_in_group, _check_user_can_add_file
import requests
import tempfile
import os
import time
import mimetypes
from uuid import UUID
from urllib.parse import urlparse
from fastapi import UploadFile, File, HTTPException
from app.services.group_service import _check_user_can_edit_group
from app.repositories.group_repository import get_group_by_id_db

SORT_FIELD_MAP = {"date": "created_at", "name": "original_name", "size": "size", "duration": 'duration'}


def generate_key(filename: str) -> str:
    return f"uploads/{uuid.uuid4()}_{filename}"


def save_file_metadata(
    file: UploadFile,
    description: str | None,
    tag_names: str,
    category_slug: str,
    owner: User,
    group_id: UUID | None = None,
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

    if group_id:
        temp_user = User(id=owner.id) # Создаем временного пользователя
        group = get_group_by_id_db(group_id)
        if not _check_user_can_add_file(group, temp_user):
            raise HTTPException(status_code=403, detail="Access denied to add file to this group")

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
        group_id=group_id,
    )

    file_record = create_file(file_create)
    file_record = FileMetadataService.enrich_file_metadata(file_record)
    from app.services.transcode_service import start_transcoding

    if file_record.mime_type and file_record.mime_type.startswith("video/"):
        start_transcoding(str(file_record.id))
    return FileResponse.model_validate(file_record)


def get_file_service(file_id: str, user_id: str): # Добавлен user_id
    file = get_file_by_id(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    # Проверка доступа
    # Создаем временного пользователя для передачи в проверку
    temp_user = User(id=user_id) # Это временный объект, используемый только для проверки
    if not _check_user_can_read_file(file, temp_user):
        raise HTTPException(status_code=403, detail="Access denied to file")
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
    min_duration: float | None = None,
    max_duration: float | None = None,
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
        query_str=query,
        category=category,
        include_tags=include_tags,
        exclude_tags=exclude_tags,
        min_duration=min_duration,
        max_duration=max_duration,
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
    """Обновление метаданных файла с проверкой доступа"""
    # Создаем временного пользователя для передачи в проверку
    temp_user = User(id=user_id) # Это временный объект, используемый только для проверки
    file = get_file_by_id(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if not _check_user_can_edit_file_in_group(file, temp_user):
        raise HTTPException(status_code=403, detail="Access denied to edit file")
    # Остальная логика обновления
    db_file = update_file(file_id, description, tag_names, category, user_id)
    db_file = FileMetadataService.enrich_file_metadata(db_file)
    return db_file


def delete_file_service(file_id: str, user_id: str) -> dict:
    """Сервис удаления файла с проверкой доступа"""
    try:
        # Создаем временного пользователя для передачи в проверку
        temp_user = User(id=user_id) # Это временный объект, используемый только для проверки
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        if not _check_user_can_edit_file_in_group(file, temp_user):
            raise HTTPException(status_code=403, detail="Access denied to delete file")
        # Удаляем файлы из S3
        FileStorageService.delete_file_from_s3(file)

        # Удаляем запись из базы данных
        delete_file_from_db(file_id)

        return {"message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def stream_file_service(file_id: str, range_header: str, user_id: str) -> dict:
    """Сервис стриминга файла с проверкой доступа"""
    try:
        # Создаем временного пользователя для передачи в проверку
        temp_user = User(id=user_id) # Это временный объект, используемый только для проверки
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        if not _check_user_can_read_file(file, temp_user):
            raise HTTPException(status_code=403, detail="Access denied to file")
        # Остальная логика стриминга (как была)
        # ... (весь остальной код функции без изменения проверки file.owner_id != user_id)
        # Убираем эту строку: if file.owner_id != user_id: raise HTTPException...
        # Получаем размер файла из S3
        try:
            file_head = s3_client.head_object(
                Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.file_path
            )
            file_size = file_head.get("ContentLength", file.size)
        except:
            # Если не удалось получить размер из S3, используем сохраненный
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

        mime_type = (
            file.mime_type
            or s3_response.get("ContentType")
            or "application/octet-stream"
        )

        safe_filename = quote(file.original_name.encode("utf-8"))
        content_disposition = f"inline; filename*=UTF-8''{safe_filename}"

        # Добавляем заголовки
        headers.update(
            {
                "Content-Disposition": content_disposition,
                "Content-Length": str(end - start + 1),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            }
        )

        return {
            "s3_response": s3_response,
            "file": file,
            "start": start,
            "end": end,
            "status_code": status_code,
            "headers": headers,
            "file_size": file_size,
            "mime_type": mime_type,
        }

    except ClientError as e:
        print(f"S3 Client Error for file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"S3 Client Error: {str(e)}")
    except HTTPException:
        # Пробрасываем HTTP исключения без изменений
        raise
    except Exception as e:
        print(f"Unexpected error streaming file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


def download_file_service(file_id: str, user_id: str) -> dict:
    """Сервис скачивания файла с проверкой доступа"""
    try:
        # Создаем временного пользователя для передачи в проверку
        temp_user = User(id=user_id) # Это временный объект, используемый только для проверки
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        if not _check_user_can_read_file(file, temp_user):
            raise HTTPException(status_code=403, detail="Access denied to file")
        # Остальная логика скачивания (как была)
        # ... (весь остальной код функции без изменения проверки file.owner_id != user_id)
        # Убираем эту строку: if file.owner_id != user_id: raise HTTPException...
        try:
            s3_response = s3_client.get_object(
                Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.file_path
            )
            return {"s3_response": s3_response, "file": file}
        except ClientError as e:
            raise HTTPException(status_code=404, detail="File not found in storage")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
def download_file_from_url_service(url: str, current_user: User) -> FileResponse:
    """
    Сервис для загрузки файла по URL
    """
    try:
        # Проверяем, что URL валидный
        parsed_url = urlparse(url)
        if not all([parsed_url.scheme, parsed_url.netloc]):
            raise HTTPException(status_code=400, detail="Invalid URL format")
        
        # Скачиваем файл по URL
        response = requests.get(url, timeout=30, stream=True)
        response.raise_for_status()
        
        # Получаем имя файла из URL или заголовков
        filename = _extract_filename_from_response(response, parsed_url)
        
        # Создаем временный файл
        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            tmp_filename = tmp_file.name
            # Записываем содержимое в временный файл
            for chunk in response.iter_content(chunk_size=8192):
                tmp_file.write(chunk)
        
        try:
            # Обрабатываем загруженный файл
            result = _process_downloaded_file(tmp_filename, filename, response, current_user)
            return result
            
        finally:
            # Удаляем временный файл
            if os.path.exists(tmp_filename):
                os.unlink(tmp_filename)
                
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to download file from URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process downloaded file: {str(e)}")

def _extract_filename_from_response(response: requests.Response, parsed_url) -> str:
    """
    Извлекает имя файла из ответа или URL
    """
    filename = None
    if 'content-disposition' in response.headers:
        content_disposition = response.headers['content-disposition']
        if 'filename=' in content_disposition:
            filename = content_disposition.split('filename=')[1].strip('"')
    
    if not filename:
        # Пытаемся получить имя из URL
        filename = os.path.basename(parsed_url.path)
        
    if not filename or filename == '':
        # Генерируем имя, если не удалось определить
        file_extension = mimetypes.guess_extension(response.headers.get('content-type', ''))
        filename = f"downloaded_file_{int(time.time())}{file_extension or ''}"
    
    return filename

def _process_downloaded_file(tmp_filename: str, filename: str, response: requests.Response, current_user: User) -> FileResponse:
    """
    Обрабатывает скачанный файл как обычную загрузку
    """
    # Получаем размер файла
    file_size = os.path.getsize(tmp_filename)
    
    # Определяем MIME-тип
    mime_type = response.headers.get('content-type', 'application/octet-stream')
    if mime_type == 'application/octet-stream':
        mime_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'

    # Создаем UploadFile объект из временного файла
    with open(tmp_filename, 'rb') as f:
        # Создаем класс-обертку для файла с правильными атрибутами
        class UploadFileWrapper:
            def __init__(self, file_obj, filename, size, content_type):
                self.file = file_obj
                self.filename = filename
                self.size = size
                self.content_type = content_type
                
            def seek(self, offset, whence=0):
                return self.file.seek(offset, whence)
                
            def read(self, size=-1):
                return self.file.read(size)
                
            def tell(self):
                return self.file.tell()

        upload_file = UploadFileWrapper(
            file_obj=f,
            filename=filename,
            size=file_size,
            content_type=mime_type
        )
        
        # Обрабатываем файл как обычную загрузку
        result = save_file_metadata(
            file=upload_file,
            description=None,
            tag_names="",
            category_slug="0-plus",
            owner=current_user,
        )
        
        return result

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

        # Проверяем, есть ли путь к HLS манифесту (это указывает на наличие транскодированных файлов)
        if file.hls_manifest_path:
            try:
                # Определяем базовый префикс для файлов транскодирования
                # hls_manifest_path обычно выглядит как transcoded/<file_id>/hls/master.m3u8
                # Нам нужно удалить всю папку transcoded/<file_id>/hls/
                hls_s3_base_parts = file.hls_manifest_path.split('/')
                if len(hls_s3_base_parts) >= 3:
                     # Формируем префикс папки: transcoded/<file_id>/hls/
                    transcoded_prefix = f"transcoded/{file.id}/hls/"

                    # Используем пагинатор для перечисления и удаления всех объектов с этим префиксом
                    paginator = s3_client.get_paginator('list_objects_v2')
                    pages = paginator.paginate(Bucket=settings.AWS_S3_BUCKET_NAME, Prefix=transcoded_prefix)

                    delete_keys = []
                    for page in pages:
                        if 'Contents' in page:
                            for obj in page['Contents']:
                                delete_keys.append({'Key': obj['Key']})

                    # Удаляем объекты пакетно (DeleteObjects принимает до 1000 ключей за раз)
                    if delete_keys:
                        for i in range(0, len(delete_keys), 1000):
                            batch = delete_keys[i:i + 1000]
                            s3_client.delete_objects(
                                Bucket=settings.AWS_S3_BUCKET_NAME,
                                Delete={'Objects': batch}
                            )
                        print(f"Deleted transcoded files for file ID {file.id} from S3 prefix: {transcoded_prefix}")
                    else:
                        print(f"No transcoded files found in S3 prefix: {transcoded_prefix} for file ID {file.id}")

            except ClientError as e:
                print(f"Failed to delete transcoded files from S3 for file ID {file.id}: {str(e)}")
            except Exception as e:
                 print(f"An unexpected error occurred while deleting transcoded files for file ID {file.id}: {str(e)}")


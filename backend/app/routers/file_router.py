import re
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Query,
    Request,
    Response,
    UploadFile,
    HTTPException
)

from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileListResponse, FileResponse
from app.services.file_service import (
    get_file_service,
    get_files_list,
    save_file_metadata,
    search_files_service,
    update_file_metadata,
)

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/")
def create_file(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    tag_names: str = Form(""),
    category: str = Form("0-plus"),
    current_user: User = Depends(get_current_user),
):
    db_file = save_file_metadata(file, description, tag_names, category, current_user)
    return FileResponse.model_validate(db_file)


@router.get("/", response_model=FileListResponse)
def list_files(
    category: str = Query("all"),
    sort_by: str = Query("date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
):
    return get_files_list(
        category=category,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        limit=limit,
        user_id=current_user.id,
    )


from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.core.config import settings


@router.get("/{file_id}/stream")
def stream_file(
    file_id: str,
    request: Request,
    range_header: str = Header(None),
    current_user: User = Depends(get_current_user),
):
    try:
        # Получаем метаданные файла
        file = get_file_service(file_id)

        # Проверяем права доступа
        if file.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Получаем файл из S3
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )

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

        # Создаем генератор для стриминга
        def iter_file():
            try:
                # Читаем по частям
                chunk_size = 8192
                content_length = end - start + 1
                bytes_read = 0

                while bytes_read < content_length:
                    read_size = min(chunk_size, content_length - bytes_read)
                    chunk = s3_response["Body"].read(read_size)
                    if not chunk:
                        break
                    bytes_read += len(chunk)
                    yield chunk
            except Exception as e:
                raise
            finally:
                try:
                    s3_response["Body"].close()
                except:
                    pass

        # Определяем MIME-type
        mime_type = (
            file.mime_type
            or s3_response.get("ContentType")
            or "application/octet-stream"
        )

        # Правильно кодируем имя файла для заголовка
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

        return StreamingResponse(
            iter_file(),
            status_code=status_code,
            media_type=mime_type,
            headers=headers,
        )

    except ClientError as e:
        print(e)
        error_msg = f"S3 Client Error for file {file_id}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException as e:
        print(e)
        # Пробрасываем HTTP исключения без изменений
        raise
    except Exception as e:
        print(e)
        error_msg = f"Unexpected error streaming file {file_id}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/thumbnail/{key}")
async def get_thumbnail(key: str):
    try:
        # Получаем объект из S3
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )

        obj = s3_client.get_object(
            Bucket=settings.AWS_S3_BUCKET_NAME, Key=f"uploads/{key}"
        )

        # Возвращаем содержимое как файл
        return Response(
            content=obj["Body"].read(),
            media_type="image/jpeg",  # или определяйте по Content-Type
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail="Thumbnail not found")


@router.get("/search", response_model=FileListResponse)
def search_files_endpoint(
    query: str = Query(None),
    category: str = Query("all"),
    include_tags: str = Query("", alias="includeTags"),
    exclude_tags: str = Query("", alias="excludeTags"),
    sort_by: str = Query("date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
):
    """
    Поиск файлов по запросу, категориям, тегам и другим параметрам.
    """

    # Парсим теги
    include_tags_list = [t.strip() for t in include_tags.split(",") if t.strip()]
    exclude_tags_list = [t.strip() for t in exclude_tags.split(",") if t.strip()]

    result = search_files_service(
        query=query,
        category=category,
        include_tags=include_tags_list,
        exclude_tags=exclude_tags_list,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        limit=limit,
        user_id=current_user.id,
    )

    return result


@router.put("/{file_id}")
def update_file(
    file_id: str,
    description: Optional[str] = Form(None),
    tag_names: str = Form(""),
    category: str = Form("0-plus"),
    current_user: User = Depends(get_current_user),
):
    """
    Обновление метаданных файла
    """
    try:
        updated_file = update_file_metadata(
            file_id=file_id,
            description=description,
            tag_names=tag_names,
            category=category,
            user_id=current_user.id
        )
        return FileResponse.model_validate(updated_file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Удаление файла
    """
    try:
        # Получаем файл для проверки прав доступа
        file = get_file_service(file_id)
        if file.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Удаляем файл из S3
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        
        # Удаляем основной файл
        try:
            s3_client.delete_object(
                Bucket=settings.AWS_S3_BUCKET_NAME,
                Key=file.file_path
            )
        except ClientError as e:
            # Логируем ошибку, но не прерываем процесс удаления
            print(f"Failed to delete main file from S3: {str(e)}")
        
        # Удаляем превью, если оно существует
        if file.preview_path:
            try:
                s3_client.delete_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME,
                    Key=file.preview_path
                )
            except ClientError as e:
                print(f"Failed to delete preview from S3: {str(e)}")
        
        # Удаляем миниатюру, если она существует
        if file.thumbnail_path:
            try:
                s3_client.delete_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME,
                    Key=file.thumbnail_path
                )
            except ClientError as e:
                print(f"Failed to delete thumbnail from S3: {str(e)}")
        
        # Удаляем запись из базы данных
        from app.core.database import get_db_session
        with get_db_session() as db:
            from app.models.base import File
            db_file = db.query(File).filter(File.id == file_id).first()
            if db_file:
                db.delete(db_file)
                db.commit()
        
        return {"message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Скачивание оригинального файла
    """
    try:
        # Получаем файл для проверки прав доступа
        file = get_file_service(file_id)
        if file.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Получаем файл из S3
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        
        # Заголовки для скачивания файла
        safe_filename = quote(file.original_name.encode('utf-8'))
        
        # Перенаправляем на прямую ссылку для скачивания или возвращаем содержимое
        # Вариант 1: Возвращаем содержимое файла
        try:
            s3_response = s3_client.get_object(
                Bucket=settings.AWS_S3_BUCKET_NAME,
                Key=file.file_path
            )
            
            headers = {
                "Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}",
                "Content-Length": str(file.size),
                "Content-Type": file.mime_type or "application/octet-stream"
            }
            
            return Response(
                content=s3_response["Body"].read(),
                headers=headers,
                media_type=file.mime_type or "application/octet-stream"
            )
        except ClientError as e:
            raise HTTPException(status_code=404, detail="File not found in storage")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    



@router.get("/{file_id}")
def get_file(file_id: str):
    file = get_file_service(file_id)
    return FileResponse.model_validate(file)
from typing import Optional
from urllib.parse import quote

from botocore.exceptions import ClientError
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.database import s3_client
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileListResponse, FileResponse
from app.services.file_service import (
    delete_file_service,
    download_file_service,
    get_file_service,
    get_files_list,
    save_file_metadata,
    search_files_service,
    stream_file_service,
    update_file_metadata,
)

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/", response_model=FileResponse)
def create_file(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    tag_names: str = Form(""),
    category: str = Form("0-plus"),
    current_user: User = Depends(get_current_user),
):
    return save_file_metadata(file, description, tag_names, category, current_user)


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


@router.get("/{file_id}/stream")
def stream_file(
    file_id: str,
    request: Request,
    range_header: str = Header(None),
    current_user: User = Depends(get_current_user),
):
    try:
        # Вызываем сервис стриминга
        stream_data = stream_file_service(file_id, range_header, current_user.id)

        s3_response = stream_data["s3_response"]
        file = stream_data["file"]
        start = stream_data["start"]
        end = stream_data["end"]
        status_code = stream_data["status_code"]
        headers = stream_data["headers"]
        file_size = stream_data["file_size"]

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
    """Поиск файлов по запросу, категориям, тегам и другим параметрам."""
    result = search_files_service(
        query=query,
        category=category,
        include_tags=include_tags,
        exclude_tags=exclude_tags,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        limit=limit,
        user_id=current_user.id,
    )

    return result


@router.put("/{file_id}", response_model=FileResponse)
def update_file(
    file_id: str,
    description: Optional[str] = Form(None),
    tag_names: str = Form(""),
    category: str = Form("0-plus"),
    current_user: User = Depends(get_current_user),
):
    """Обновление метаданных файла"""
    try:
        updated_file = update_file_metadata(
            file_id=file_id,
            description=description,
            tag_names=tag_names,
            category=category,
            user_id=current_user.id,
        )
        return FileResponse.model_validate(updated_file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Удаление файла"""
    try:
        result = delete_file_service(file_id, current_user.id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Скачивание оригинального файла"""
    try:
        # Вызываем сервис скачивания
        download_data = download_file_service(file_id, current_user.id)

        s3_response = download_data["s3_response"]
        file = download_data["file"]

        # Заголовки для скачивания файла
        safe_filename = quote(file.original_name.encode("utf-8"))

        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}",
            "Content-Length": str(file.size),
            "Content-Type": file.mime_type or "application/octet-stream",
        }

        return Response(
            content=s3_response["Body"].read(),
            headers=headers,
            media_type=file.mime_type or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{file_id}", response_model=FileResponse)
def get_file(file_id: str):
    file = get_file_service(file_id)
    return FileResponse.model_validate(file)

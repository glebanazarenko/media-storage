from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileListResponse, FileResponse
from app.services.file_service import (
    get_file_service,
    get_files_list,
    save_file_metadata,
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


@router.get("/{file_id}")
def get_file(file_id: str):
    file = get_file_service(file_id)
    return FileResponse.model_validate(file)


@router.get("/", response_model=FileListResponse)
def list_files(
    category: str = Query("all"),
    sort_by: str = Query("date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
):
    from app.main import logger

    logger.info(sort_order)
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

        # Получаем объект из S3
        s3_response = s3_client.get_object(
            Bucket=settings.AWS_S3_BUCKET_NAME, Key=file.file_path
        )

        # Создаем генератор для стриминга
        def iter_file():
            try:
                # Проверяем, есть ли iter_chunks
                if hasattr(s3_response["Body"], "iter_chunks"):
                    for chunk in s3_response["Body"].iter_chunks(chunk_size=8192):
                        yield chunk
                else:
                    # Альтернативный метод - читаем по частям
                    while True:
                        chunk = s3_response["Body"].read(8192)
                        if not chunk:
                            break
                        yield chunk
            except Exception as e:
                raise
            finally:
                try:
                    s3_response["Body"].close()
                except Exception as e:
                    pass

        # Определяем MIME-type
        mime_type = (
            file.mime_type
            or s3_response.get("ContentType")
            or "application/octet-stream"
        )

        # Правильно кодируем имя файла для заголовка
        # Используем URL encoding для имени файла
        safe_filename = quote(file.original_name.encode("utf-8"))
        content_disposition = f"inline; filename*=UTF-8''{safe_filename}"

        return StreamingResponse(
            iter_file(),
            media_type=mime_type,
            headers={
                "Content-Disposition": content_disposition,
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            },
        )

    except ClientError as e:
        error_msg = f"S3 Client Error for file {file_id}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException:
        # Пробрасываем HTTP исключения без изменений
        raise
    except Exception as e:
        error_msg = f"Unexpected error streaming file {file_id}: {str(e)}"
        raise HTTPException(status_code=500, detail=error_msg)

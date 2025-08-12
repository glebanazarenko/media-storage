from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, Query

from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileResponse, FileListResponse
from app.services.file_service import get_file_service, save_file_metadata, get_files_list

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/")
def create_file(
    file: UploadFile = File(...),
    description: Optional[str] = None,
    tag_names: str = Form(""),
    current_user: User = Depends(get_current_user),
):
    db_file = save_file_metadata(file, description, tag_names, current_user)
    return FileResponse.model_validate(db_file)


@router.get("/{file_id}")
def get_file(file_id: str):
    file = get_file_service(file_id)
    return FileResponse.model_validate(file)

@router.get("/", response_model=FileListResponse)
def list_files(
    category: str = Query("all"),
    sort_by: str = Query("date"),
    sort_order: str = Query("desc"),
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


from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from app.core.config import settings
import boto3
from botocore.exceptions import ClientError
from urllib.parse import quote

@router.get("/{file_id}/stream")
def stream_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    from app.main import logger
    try:
        logger.info(f"Starting stream for file_id: {file_id}, user_id: {current_user.id}")
        
        # Получаем метаданные файла
        file = get_file_service(file_id)
        logger.info(f"File found: {file.original_name}, mime_type: {file.mime_type}")
        
        # Проверяем права доступа
        if file.owner_id != current_user.id:
            logger.warning(f"Access denied for user {current_user.id} to file {file_id}")
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Получаем файл из S3
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        
        logger.info(f"Connecting to S3 bucket: {settings.AWS_S3_BUCKET_NAME}, key: {file.file_path}")
        
        # Получаем объект из S3
        s3_response = s3_client.get_object(
            Bucket=settings.AWS_S3_BUCKET_NAME, 
            Key=file.file_path
        )
        
        logger.info(f"S3 object retrieved successfully, content type: {s3_response.get('ContentType')}")
        
        # Создаем генератор для стриминга
        def iter_file():
            try:
                # Проверяем, есть ли iter_chunks
                if hasattr(s3_response['Body'], 'iter_chunks'):
                    logger.info("Using iter_chunks method")
                    for chunk in s3_response['Body'].iter_chunks(chunk_size=8192):
                        yield chunk
                else:
                    # Альтернативный метод - читаем по частям
                    logger.info("Using read method")
                    while True:
                        chunk = s3_response['Body'].read(8192)
                        if not chunk:
                            break
                        yield chunk
            except Exception as e:
                logger.error(f"Error during streaming: {str(e)}", exc_info=True)
                raise
            finally:
                try:
                    s3_response['Body'].close()
                    logger.info("S3 stream closed")
                except Exception as e:
                    logger.error(f"Error closing S3 stream: {str(e)}")
        
        # Определяем MIME-type
        mime_type = file.mime_type or s3_response.get('ContentType') or "application/octet-stream"
        logger.info(f"Using mime_type: {mime_type}")
        
        # Правильно кодируем имя файла для заголовка
        # Используем URL encoding для имени файла
        safe_filename = quote(file.original_name.encode('utf-8'))
        content_disposition = f'inline; filename*=UTF-8\'\'{safe_filename}'
        
        logger.info(f"Using content_disposition: {content_disposition}")
        
        return StreamingResponse(
            iter_file(),
            media_type=mime_type,
            headers={
                "Content-Disposition": content_disposition,
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600"
            }
        )
        
    except ClientError as e:
        error_msg = f"S3 Client Error for file {file_id}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException:
        # Пробрасываем HTTP исключения без изменений
        raise
    except Exception as e:
        error_msg = f"Unexpected error streaming file {file_id}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
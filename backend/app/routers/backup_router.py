from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from botocore.exceptions import ClientError
from fastapi.responses import StreamingResponse, RedirectResponse
from celery.result import AsyncResult
from app.core.database import s3_client
import io
from app.core.config import settings
from typing import Iterator
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.backup_schemas import BackupUploadResponse
from app.services.backup_service import BackupService
from app.tasks.backup_tasks import celery_app # Импортируем приложение Celery для проверки статуса

router = APIRouter(prefix="/backup", tags=["Backup"])

backup_service = BackupService()

@router.get("/download")
def initiate_user_backup(current_user: User = Depends(get_current_user)):
    """Инициирует создание бэкапа всех файлов пользователя (асинхронно)"""
    try:
        task_id = backup_service.create_backup(current_user)
        return {"task_id": task_id, "message": "Backup task initiated"}
    except Exception as e:
        print(f"Initiate backup error: {e}")
        raise e

@router.get("/download-full")
def initiate_full_backup(current_user: User = Depends(get_current_user)):
    """Инициирует создание полного бэкапа всех данных (асинхронно, только для админов)"""
    try:
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Access denied. Admin rights required.")
        task_id = backup_service.create_full_backup(current_user)
        return {"task_id": task_id, "message": "Full backup task initiated"}
    except Exception as e:
        print(f"Initiate full backup error: {e}")
        raise e

@router.get("/status/{task_id}")
def get_backup_status(task_id: str, current_user: User = Depends(get_current_user)):
    """Проверяет статус задачи создания бэкапа"""
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state == 'PENDING':
        return {"task_id": task_id, "status": "pending", "message": "Task is waiting to be processed"}
    elif task_result.state == 'PROGRESS':
        # Если вы добавите обновление прогресса в задаче, здесь можно будет его вернуть
        return {"task_id": task_id, "status": "in_progress", "message": "Task is currently running"}
    elif task_result.state == 'SUCCESS':
        # Результат задачи - это словарь с 's3_key'
        s3_key = task_result.result.get('s3_key')
        return {
            "task_id": task_id,
            "status": "completed",
            "s3_key": s3_key,
            "download_url": f"/backup/download-task/{task_id}" # Предлагаемый URL для скачивания
        }
    else: # FAILURE
        return {
            "task_id": task_id,
            "status": "failed",
            "error": str(task_result.info) # Сообщение об ошибке
        }

@router.get("/download-task/{task_id}")
def download_backup_by_task_id(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Возвращает готовый бэкап, если задача завершена.
    (НОВАЯ ВЕРСИЯ: Стримит содержимое из S3 через FastAPI)
    """
    task_result = AsyncResult(task_id, app=celery_app)

    if task_result.state != 'SUCCESS':
        if task_result.state == 'FAILURE':
            raise HTTPException(status_code=500, detail=f"Backup creation failed: {str(task_result.info)}")
        else:
            raise HTTPException(status_code=400, detail=f"Backup not ready yet. Current state: {task_result.state}")

    # Получаем ключ S3 из результата задачи
    s3_key = task_result.result.get('s3_key')
    if not s3_key:
        raise HTTPException(status_code=500, detail="Backup file location not found in task result")

    # Получаем объект из S3
    try:
        response = s3_client.get_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key)
        file_size = response.get('ContentLength', 0)
        content_type = response.get('ContentType', 'application/zip')
    except ClientError as e:
        print(f"Error downloading file from S3: {e}")
        raise HTTPException(status_code=500, detail="Failed to download backup file from storage")

    def iter_chunks(chunk_size: int = 8192) -> Iterator[bytes]:
        """
        Генератор чанков из тела ответа S3
        """
        stream = response['Body']
        while True:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            yield chunk

    # Возвращаем как StreamingResponse
    return StreamingResponse(
        iter_chunks(),
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename={s3_key.split('/')[-1]}",
            "Content-Length": str(file_size)
        }
    )


@router.post("/upload", response_model=BackupUploadResponse)
async def upload_backup(
    backup_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Восстанавливает данные из бэкап файла"""
    try:
        result = await backup_service.restore_backup(backup_file, current_user)
        return result
    except Exception as e:
        print(f"Upload backup error: {e}")
        raise e

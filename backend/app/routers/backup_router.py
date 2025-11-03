from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from botocore.exceptions import ClientError
from fastapi.responses import StreamingResponse, RedirectResponse
from celery.result import AsyncResult
from app.core.database import s3_client
import io
import uuid
from app.core.config import settings
from typing import Iterator, Optional
import tempfile
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.backup_schemas import BackupUploadResponse, BackupStatusResponse
from app.services.backup_service import BackupService
from app.tasks.backup_tasks import celery_app # Импортируем приложение Celery для проверки статуса
from app.tasks.backup_restore import restore_backup_task
import tempfile
import os
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db_session
from app.models.base import User
from app.tasks.backup_restore import restore_backup_task # Убедитесь, что импортируете задачу

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


class BackupFile(BaseModel):
    s3_key: str
    filename: str
    size: int
    last_modified: str

@router.get("/list", response_model=list[BackupFile])
def list_backups(current_user: User = Depends(get_current_user)):
    """
    Возвращает список бэкапов, доступных в S3 в папке backups/
    """
    try:
        # Используем paginator для получения всех объектов с префиксом
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(
            Bucket=settings.AWS_S3_BUCKET_NAME,
            Prefix='backups/'  # Только файлы в этой папке
        )

        backups = []
        for page in pages:
            if 'Contents' in page:
                for obj in page['Contents']:
                    # Пропускаем папки (ключи, заканчивающиеся на /)
                    if obj['Key'].endswith('/'):
                        continue
                    backups.append({
                        "s3_key": obj['Key'],
                        "filename": obj['Key'].split('/')[-1],  # Имя файла
                        "size": obj['Size'],
                        "last_modified": obj['LastModified'].isoformat()
                    })

        # Сортируем по дате (новые первыми)
        backups.sort(key=lambda x: x['last_modified'], reverse=True)

        return backups

    except Exception as e:
        print(f"Error listing backups from S3: {e}")
        raise HTTPException(status_code=500, detail="Failed to list backups from storage")



class RestoreBackupRequest(BaseModel):
    s3_key: str

@router.post("/restore-by-s3-key", response_model=BackupUploadResponse)
def restore_backup_by_s3_key(
    request: RestoreBackupRequest,  # Принимаем s3_key в теле запроса
    current_user: User = Depends(get_current_user),
):
    s3_key = request.s3_key

    # Проверяем, существует ли файл в S3 по этому ключу
    try:
        s3_client.head_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key)
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code')
        if error_code == 'NoSuchKey' or error_code == '404':
            raise HTTPException(status_code=404, detail=f"Backup file not found in S3: {s3_key}")
        else:
            raise HTTPException(status_code=500, detail=f"Error accessing backup file in S3: {str(e)}")

    # Отправляем задачу Celery, передавая S3 ключ
    # В данном случае, мы *не создаем* временный файл в S3, а используем существующий
    task_id = restore_backup_task.delay(s3_key, str(current_user.id))

    return {"message": "Backup restore initiated", "task_id": str(task_id)}


@router.get("/download-by-s3-key/{s3_key_filename}") # GET запрос с s3_key_filename в URL
def download_backup_by_s3_key(
    s3_key_filename: str, # Извлекаем ИМЯ ФАЙЛА из пути как s3_key_filename
    current_user: User = Depends(get_current_user)
):
    """
    Скачивает файл бэкапа напрямую из S3 по имени файла.
    Доступно только администратору.
    Строит полный s3_key, добавляя префикс 'backups/'.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied. Admin rights required.")

    s3_key = f"backups/{s3_key_filename}"

    try:
        response = s3_client.get_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key)
        file_size = response.get('ContentLength', 0)
        content_type = response.get('ContentType', 'application/zip')
    except ClientError as e:
        print(f"Error downloading file from S3: {e}")
        # Уточним ошибку, если файл не найден
        error_code = e.response.get('Error', {}).get('Code')
        if error_code == 'NoSuchKey':
             raise HTTPException(status_code=404, detail=f"Backup file not found in S3: {s3_key}")
        else:
            raise HTTPException(status_code=500, detail="Failed to download backup file from storage")

    def iter_chunks(chunk_size: int = 8192) -> Iterator[bytes]:
        stream = response['Body']
        while True:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            yield chunk

    return StreamingResponse(
        iter_chunks(),
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename={s3_key.split('/')[-1]}",
            "Content-Length": str(file_size)
        }
    )
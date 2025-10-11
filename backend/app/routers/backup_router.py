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




class BackupUploadResponse(BaseModel):
    message: str
    task_id: str

@router.post("/upload", response_model=BackupUploadResponse)
def upload_backup(
    backup_file: UploadFile = File(...), # Имя файла будет использоваться для построения пути в S3
    current_user: User = Depends(get_current_user),
):
    temp_file_path = None
    s3_key_to_use = None
    should_delete_s3_key = False # Флаг, указывающий, нужно ли удалять файл из S3 после задачи

    try:
        # Построим ожидаемый путь в S3 на основе имени файла
        expected_s3_path = f"backups/{backup_file.filename}"

        # Проверяем, существует ли файл в S3 по этому пути
        try:
            s3_client.head_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=expected_s3_path)
            # Если head_object не вызывает исключение, файл существует
            s3_key_to_use = expected_s3_path
            should_delete_s3_key = False # Не удаляем, так как он уже существовал
            print(f"Using existing backup file from S3: {s3_key_to_use}") # Для отладки
        except ClientError as e:
            # Проверяем, действительно ли это "NoSuchKey"
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == 'NoSuchKey' or error_code == '404':
                # Файл не существует, загружаем новый
                print(f"File {expected_s3_path} not found in S3. Uploading new file.") # Для отладки

                # Создаем временный файл для загруженного содержимого
                with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                    # Читаем и записываем содержимое загруженного файла в локальный временный файл
                    import shutil
                    shutil.copyfileobj(backup_file.file, temp_file)
                    temp_file_path = temp_file.name

                # Генерируем уникальный ключ для S3 (или используем тот же путь, если хотите перезаписать)
                # Для безопасности, лучше использовать уникальный ключ, но если вы хотите перезаписать:
                # s3_key_to_use = expected_s3_path
                # Или уникальный ключ:
                unique_filename = f"{uuid.uuid4()}.zip"
                s3_key_to_use = f"temp_backups/{unique_filename}"

                # Загружаем файл в S3
                with open(temp_file_path, 'rb') as f:
                    s3_client.put_object(
                        Bucket=settings.AWS_S3_BUCKET_NAME,
                        Key=s3_key_to_use,
                        Body=f,
                        ContentType='application/zip' # Указываем тип для ясности
                    )

                should_delete_s3_key = True # Удаляем, так как это временный файл, созданный сейчас
                print(f"Uploaded new backup file to S3: {s3_key_to_use}") # Для отладки

                # Удаляем локальный временный файл, т.к. он теперь в S3
                os.unlink(temp_file_path)
                temp_file_path = None # Убираем ссылку
            else:
                # Это другая ошибка S3, не 'NoSuchKey', пробрасываем её
                raise e

        # Отправляем задачу Celery, передавая S3 ключ и флаг удаления
        task_id = restore_backup_task.delay(s3_key_to_use, str(current_user.id), should_delete_s3_key)

        return {"message": "Backup upload accepted", "task_id": str(task_id)}

    except HTTPException:
        # Если это уже HTTPException, просто пробрасываем её
        raise
    except Exception as e:
        # Если произошла ошибка, удаляем локальный файл (если он есть)
        # и S3 объект (если он был *создан* в этой функции и флаг указывает на удаление)
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                print(f"Cleaned up temp file after error: {temp_file_path}")
            except OSError as cleanup_error:
                print(f"Warning: Could not clean up temp file {temp_file_path}: {cleanup_error}")

        # Удаляем S3 объект только если он был *создан* в этой функции (should_delete_s3_key == True)
        # и *не* если он существовал до этого.
        if s3_key_to_use and should_delete_s3_key:
            try:
                s3_client.delete_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key_to_use)
                print(f"Cleaned up S3 temp file after error: {s3_key_to_use}")
            except Exception as s3_cleanup_error:
                print(f"Warning: Could not clean up S3 temp file {s3_key_to_use}: {s3_cleanup_error}")

        raise HTTPException(status_code=500, detail=f"Backup upload failed: {str(e)}")
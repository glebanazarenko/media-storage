from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user
from app.models.base import User
from app.schemas.backup_schemas import BackupUploadResponse
from app.services.backup_service import BackupService

router = APIRouter(prefix="/backup", tags=["Backup"])

backup_service = BackupService()


@router.get("/download")
def download_backup(current_user: User = Depends(get_current_user)):
    """Создает и возвращает бэкап всех файлов пользователя в формате ZIP"""
    zip_buffer, filename = backup_service.create_backup(current_user)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/upload", response_model=BackupUploadResponse)
async def upload_backup(
    backup_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Восстанавливает данные из бэкап файла"""
    result = await backup_service.restore_backup(backup_file, current_user)
    return result

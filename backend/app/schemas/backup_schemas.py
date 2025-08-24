from pydantic import BaseModel


class BackupUploadResponse(BaseModel):
    """Схема для ответа при загрузке бэкапа"""

    message: str
    restored_files: int
    total_files: int

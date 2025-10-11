from pydantic import BaseModel
from typing import Optional

class BackupUploadResponse(BaseModel):
    message: str
    task_id: str

class BackupStatusResponse(BaseModel):
    task_id: str
    status: str  # 'pending', 'in_progress', 'completed', 'failed'
    message: Optional[dict] = None
    error: Optional[str] = None
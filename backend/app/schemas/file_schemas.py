from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class FileCreate(BaseModel):
    original_name: str
    mime_type: str
    description: Optional[str] = None
    tags: List[str] = []
    file_path: str
    size: int
    owner_id: UUID


class FileResponse(FileCreate):
    id: UUID
    thumbnail_path: Optional[str]
    preview_path: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

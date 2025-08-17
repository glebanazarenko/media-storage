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
    category_id: UUID
    thumbnail_path: Optional[str] = None


class FileResponse(FileCreate):
    id: UUID
    thumbnail_path: Optional[str]
    preview_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    tags_name: List[str] = []
    category_name: str

    class Config:
        from_attributes = True


class FileListResponse(BaseModel):
    files: List[FileResponse]
    total: int
    page: int
    limit: int

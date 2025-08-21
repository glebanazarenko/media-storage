from datetime import datetime
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel

class TagBackup(BaseModel):
    id: str
    name: str
    slug: str
    created_at: str
    updated_at: str

class CategoryBackup(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str]
    created_at: str

class FileBackup(BaseModel):
    id: str
    original_name: str
    mime_type: str
    file_path: str
    size: int
    thumbnail_path: Optional[str]
    preview_path: Optional[str]
    description: Optional[str]
    tags: List[str]
    category_id: Optional[str]
    created_at: str
    updated_at: str

class BackupData(BaseModel):
    user_id: str
    backup_date: str
    files: List[FileBackup]
    tags: List[TagBackup]
    categories: List[CategoryBackup]
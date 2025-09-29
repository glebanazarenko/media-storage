from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID

from app.schemas.file_schemas import FileResponse

# --- Схемы для групп ---
class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class GroupFileAdd(BaseModel):
    file_id: UUID # UUID в строковом формате

class GroupCreate(GroupBase):
    pass

class GroupUpdate(GroupBase):
    pass

class GroupResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    creator_id: UUID
    access_level: str # reader, editor, admin
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Схемы для участников группы ---
class GroupMemberBase(BaseModel):
    user_id: UUID
    role: str # reader, editor, admin

class GroupMemberAdd(BaseModel):
    user_id: str # Принимаем как строку, конвертируем в UUID в сервисе
    role: str # reader, editor, admin

class GroupMemberUpdate(BaseModel):
    role: str # reader, editor, admin

class GroupMemberResponse(BaseModel):
    user_id: UUID
    group_id: UUID
    role: str
    invited_by: Optional[UUID]
    invited_at: datetime
    accepted_at: Optional[datetime]
    revoked_at: Optional[datetime]

    class Config:
        from_attributes = True

# --- Схема для списка файлов в группе ---
class GroupFileListResponse(BaseModel):
    files: List[FileResponse]
    total: int
    page: int
    limit: int

    class Config:
        from_attributes = True

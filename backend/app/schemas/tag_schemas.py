from uuid import UUID

from pydantic import BaseModel


class TagCreate(BaseModel):
    name: str


class TagResponse(BaseModel):
    id: UUID
    name: str
    slug: str

    class Config:
        from_attributes = True

import uuid

from sqlalchemy import UUID as UUIDType
from sqlalchemy import Column, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class FileGroup(Base):
    __tablename__ = "file_groups"

    file_id = Column(UUIDType(as_uuid=True), ForeignKey("files.id"), primary_key=True)
    group_id = Column(UUIDType(as_uuid=True), ForeignKey("groups.id"), primary_key=True)

    file = relationship("File", back_populates="groups")
    group = relationship("Group", back_populates="files")

import uuid

from sqlalchemy import JSON, TIMESTAMP, Column, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class File(Base):
    __tablename__ = "files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_path = Column(Text, nullable=False)
    size = Column(Integer, nullable=False)
    thumbnail_path = Column(Text)
    preview_path = Column(Text)
    description = Column(Text)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tags = Column(JSON, default=[])
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="files")
    groups = relationship("Group", secondary="file_groups", back_populates="files")

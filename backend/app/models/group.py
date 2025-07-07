import uuid

from sqlalchemy import TIMESTAMP, Column, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Group(Base):
    __tablename__ = "groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    access_level = Column(String(20), default="reader")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    creator = relationship("User", back_populates="created_groups")
    members = relationship("GroupMember", back_populates="group")
    files = relationship("File", secondary="file_groups", back_populates="groups")

import uuid

from sqlalchemy import TIMESTAMP, Column, String, func
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)
    slug = Column(String(60), unique=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

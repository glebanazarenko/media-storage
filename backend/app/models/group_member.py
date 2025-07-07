from sqlalchemy import Column, String, TIMESTAMP, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid

class GroupMember(Base):
    __tablename__ = "group_members"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), primary_key=True)
    role = Column(String(20), default="reader")
    invited_by = Column(UUID(as_uuid=True))
    invited_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    accepted_at = Column(TIMESTAMP(timezone=True))
    revoked_at = Column(TIMESTAMP(timezone=True))

    user = relationship("User", back_populates="group_memberships")
    group = relationship("Group", back_populates="members")
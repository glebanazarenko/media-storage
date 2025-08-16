import uuid
from datetime import datetime

from sqlalchemy import JSON, TIMESTAMP
from sqlalchemy import UUID as UUIDType
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base

# Association table for many-to-many relationship between File and Group
file_group = Table(
    "file_groups",
    Base.metadata,
    Column("file_id", UUIDType(as_uuid=True), ForeignKey("files.id"), primary_key=True),
    Column(
        "group_id", UUIDType(as_uuid=True), ForeignKey("groups.id"), primary_key=True
    ),
)


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUIDType(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)  # "0+", "16+", "18+"
    slug = Column(
        String(60), unique=True, nullable=False
    )  # "0-plus", "16-plus", "18-plus"
    description = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    # Связь с файлами
    files = relationship("File", back_populates="category")


class File(Base):
    __tablename__ = "files"

    id = Column(UUIDType(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_path = Column(Text, nullable=False)
    size = Column(Integer, nullable=False)
    thumbnail_path = Column(Text)
    preview_path = Column(Text)
    description = Column(Text)
    owner_id = Column(UUIDType(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tags = Column(JSON, default=[])
    category_id = Column(UUIDType(as_uuid=True), ForeignKey("categories.id"))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner = relationship("User", back_populates="files")
    groups = relationship("Group", secondary=file_group, back_populates="files")
    category = relationship("Category", back_populates="files")


class GroupMember(Base):
    __tablename__ = "group_members"

    user_id = Column(UUIDType(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    group_id = Column(UUIDType(as_uuid=True), ForeignKey("groups.id"), primary_key=True)
    role = Column(String(20), default="reader")
    invited_by = Column(UUIDType(as_uuid=True))
    invited_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    accepted_at = Column(TIMESTAMP(timezone=True))
    revoked_at = Column(TIMESTAMP(timezone=True))

    user = relationship("User", back_populates="group_memberships")
    group = relationship("Group", back_populates="members")


class Group(Base):
    __tablename__ = "groups"

    id = Column(UUIDType(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    creator_id = Column(UUIDType(as_uuid=True), ForeignKey("users.id"), nullable=False)
    access_level = Column(String(20), default="reader")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    creator = relationship("User", back_populates="created_groups")
    members = relationship("GroupMember", back_populates="group")
    files = relationship("File", secondary=file_group, back_populates="groups")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUIDType(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)
    slug = Column(String(60), unique=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUIDType(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(128), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    files = relationship("File", back_populates="owner")
    group_memberships = relationship("GroupMember", back_populates="user")
    created_groups = relationship("Group", back_populates="creator")

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.models.base import User
from app.schemas.user_schemas import TokenData, UserCreate


def get_user_by_username(username: str) -> Optional[User]:
    with get_db_session() as db:
        return db.query(User).filter(User.username == username).first()


def get_user_by_email(email: str) -> Optional[User]:
    with get_db_session() as db:
        return db.query(User).filter(User.email == email).first()


def create_user(user_data: UserCreate) -> User:
    with get_db_session() as db:
        user_dict = user_data.model_dump()
        new_user = User(**user_dict)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user

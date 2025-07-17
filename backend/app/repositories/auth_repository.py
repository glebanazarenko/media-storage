from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db_session
from app.core.security import oauth2_scheme
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


def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = get_user_by_username(username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password
from app.repositories.auth_repository import create_user, get_current_user
from app.schemas.user_schemas import UserCreate


def authenticate_user(username: str, password: str):
    user = get_current_user(username)
    if not user or not verify_password(password, user.password):
        return None
    return user


def register_new_user(user_create: UserCreate):
    user_create.password = get_password_hash(user_create.password)
    return create_user(user_create)
from typing import Optional

from app.core.database import get_db_session
from app.models.base import User
from app.schemas.user_schemas import UserCreate


def get_user_by_username(username: str) -> Optional[User]:
    with get_db_session() as db:
        return db.query(User).filter(User.username == username).first()


def create_user(user_data: UserCreate) -> User:
    with get_db_session() as db:
        user_dict = user_data.model_dump()
        new_user = User(**user_dict)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user

def get_all_users() -> list[User]:
    with get_db_session() as db:
        users = db.query(User).all() # Получаем всех пользователей
        return users
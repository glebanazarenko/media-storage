from fastapi import HTTPException

from app.core.security import create_access_token, get_password_hash, verify_password
from app.repositories.auth_repository import create_user, get_user_by_username
from app.schemas.user_schemas import UserCreate


def authenticate_user(username: str, password: str) -> str:
    user = get_user_by_username(username)
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    access_token = create_access_token(data={"sub": str(user.id)})

    return {"access_token": access_token, "token_type": "bearer"}


def register_new_user(user_create: UserCreate):
    user_create.password = get_password_hash(user_create.password)
    return create_user(user_create)

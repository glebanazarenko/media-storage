from fastapi import APIRouter

from app.schemas.user_schemas import UserCreate, UserLogin, UserResponse
from app.services.auth_service import authenticate_user, register_new_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
def login(form_data: UserLogin):
    token_data = authenticate_user(form_data.username, form_data.password)
    return token_data


@router.post("/register")
def register(user: UserCreate):
    db_user = register_new_user(user)
    user_dict = {
        "id": str(db_user.id),
        "username": db_user.username,
        "email": db_user.email,
        "is_active": db_user.is_active,
        "is_admin": db_user.is_admin,
        "created_at": db_user.created_at,
        "updated_at": db_user.updated_at if db_user.updated_at else db_user.created_at,
    }
    return UserResponse.model_validate(user_dict)

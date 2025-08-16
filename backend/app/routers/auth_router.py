from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.schemas.user_schemas import UserCreate, UserLogin, UserResponse
from app.services.auth_service import authenticate_user, register_new_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
def login(form_data: UserLogin):
    access_token = authenticate_user(form_data.username, form_data.password)
    token = jsonable_encoder(access_token)
    content = {"message": "You've successfully logged in. Welcome back!"}
    response = JSONResponse(content=content)
    response.set_cookie(
        "Authorization",
        value=f"Bearer {token}",
        httponly=True,
        max_age=1800,
        expires=1800,
        samesite="None",  # <-- Меняем Lax на None
        secure=True,  # <-- Должно быть True, иначе не работает с SameSite=None
    )

    return response


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


from fastapi import Depends

from app.core.security import get_current_user
from app.models.base import User


@router.post(
    "/test",
    dependencies=[Depends(get_current_user)],
)
def test(current_user: User = Depends(get_current_user)):
    return current_user.username


@router.get(
    "/profile",
    dependencies=[Depends(get_current_user)],
)
def profile(current_user: User = Depends(get_current_user)):
    return current_user

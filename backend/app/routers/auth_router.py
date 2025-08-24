from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.user_schemas import UserCreate, UserLogin, UserResponse
from app.services.auth_service import authenticate_user, register_new_user
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=UserResponse)
def login(form_data: UserLogin):
    access_token = authenticate_user(form_data.username, form_data.password)
    token = jsonable_encoder(access_token)
    content = {"message": "You've successfully logged in. Welcome back!"}
    response = JSONResponse(content=content)
    response.set_cookie(
        "Authorization",
        value=f"Bearer {token}",
        httponly=True,
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES*60,
        expires=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES*60,
        samesite="None" if settings.IS_PRODUCTION else "Lax",
        secure=settings.IS_PRODUCTION,
    )
    return response


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate):
    db_user = register_new_user(user)
    return UserResponse.model_validate(db_user.to_response_dict())


@router.post(
    "/test",
    response_model=str,
    dependencies=[Depends(get_current_user)],
)
def test(current_user: User = Depends(get_current_user)):
    return current_user.username


@router.get(
    "/profile",
    response_model=UserResponse,
    dependencies=[Depends(get_current_user)],
)
def profile(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user.to_response_dict())

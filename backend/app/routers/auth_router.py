from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

# from app.schemas.user import UserCreate, UserResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token
from app.models.user import User

# from app.services.auth_service import authenticate_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

# class Token(BaseModel):
#     access_token: str
#     token_type: str

# @router.post("/login")
# def login(
#     form_data: UserCreate,
#     db: Session = Depends(get_db)
# ):
#     user = authenticate_user(db, form_data.username, form_data.password)
#     if not user:
#         raise HTTPException(status_code=400, detail="Incorrect username or password")

#     access_token = create_access_token(data={"sub": user.id})

#     return {"access_token": access_token, "token_type": "bearer"}

# @router.post("/register")
# def register(
#     user: UserCreate,
#     db: Session = Depends(get_db)
# ):
#     # Здесь будет логика регистрации
#     db_user = User(**user.model_dump())
#     db.add(db_user)
#     db.commit()
#     db.refresh(db_user)
#     return UserResponse.model_validate(db_user)

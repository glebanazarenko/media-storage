import logging

import uvicorn
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# from app.models.base import Base  # Если у тебя есть base.py с Base = declarative_base()
from app.core.config import settings  # Если ты используешь config.py для настроек
from app.core.database import get_db
from app.routers import auth_router, file_router, group_router, tag_router

# Инициализация приложения
app = FastAPI(
    title="Media Storage API",
    description="Платформа для хранения и управления медиафайлами",
    version="0.1.0",
)

# Подключение middleware CORS
origins = [
    "http://localhost:3000",  # frontend
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth_router.router, prefix="/api/auth", tags=["Auth"])
app.include_router(file_router.router, prefix="/api/files", tags=["Files"])
app.include_router(group_router.router, prefix="/api/groups", tags=["Groups"])
app.include_router(tag_router.router, prefix="/api/tags", tags=["Tags"])


# Опционально: зависимость БД по умолчанию
@app.get("/ping")
def ping(db: Session = Depends(get_db)):
    return {"status": "ok", "message": "Backend is running!"}


@app.get("/test-env-jwt-alogitm")
def test_env():
    return settings.JWT_ALGORITHM


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

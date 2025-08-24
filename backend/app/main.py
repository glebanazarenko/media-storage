import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (
    auth_router,
    backup_router,
    file_router,
    group_router,
    tag_router,
)

# Глобальная настройка логирования
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Инициализация приложения
app = FastAPI(
    title="Media Storage API",
    description="Платформа для хранения и управления медиафайлами",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth_router.router)
app.include_router(file_router.router)
app.include_router(group_router.router)
app.include_router(tag_router.router)
app.include_router(backup_router.router)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

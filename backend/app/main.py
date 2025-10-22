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
    user_router
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

# Создай отдельное приложение (или под-приложение) с префиксом /api
api_app = FastAPI(
    title="Media Storage API",
    description="Платформа для хранения и управления медиафайлами",
    version="0.1.0",
)

# Подключение роутеров к api_app (с префиксом /api)
from app.routers import (
    auth_router,
    backup_router,
    file_router,
    group_router,
    tag_router,
    user_router
)

api_app.include_router(auth_router.router)
api_app.include_router(file_router.router)
api_app.include_router(group_router.router)
api_app.include_router(tag_router.router)
api_app.include_router(backup_router.router)
api_app.include_router(user_router.router)

# Подключаем api_app к основному app с префиксом /api
app.mount("/api", api_app)

from celery import Celery
from app.core.config import settings

celery_app = Celery('myapp')
celery_app.conf.broker_url = settings.CELERY_BROKER_URL
celery_app.conf.result_backend = settings.CELERY_RESULT_BACKEND

# Автоматически искать задачи в пакете app.tasks
celery_app.autodiscover_tasks(['app.tasks'])


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

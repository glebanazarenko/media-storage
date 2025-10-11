from celery import Celery
from app.core.config import settings

# Создаем общий экземпляр Celery
celery_app = Celery('myapp')
celery_app.conf.broker_url = settings.CELERY_BROKER_URL
celery_app.conf.result_backend = settings.CELERY_RESULT_BACKEND

# Автоматически искать задачи в пакете app.tasks
celery_app.autodiscover_tasks(['app.tasks'])
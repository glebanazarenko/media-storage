#!/bin/bash

# Выполняем миграции базы данных
echo "Running database migrations..."
alembic upgrade head

# Запускаем приложение
echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile /app/ssl/key.pem --ssl-certfile /app/ssl/cert.crt --reload
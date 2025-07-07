Запуск проекта

docker-compose up -d --build

docker-compose down

Удаление томов

docker-compose down -v

При первом создании

$ docker-compose exec backend aerich init -t src.database.config.TORTOISE_ORM
Success create migrate location ./migrations
Success write config to pyproject.toml

$ docker-compose exec backend aerich init-db
Success create app migrate location migrations/models
Success generate schema for app "models"


При обновлении Миграции

docker-compose exec backend aerich migrate
docker-compose exec backend aerich upgrade

Для отладки

docker-compose exec backend sh
uvicorn src.main:app --host 0.0.0.0 --port 5000 --reload
uvicorn src.main:app --host 0.0.0.0 --port 5035 --reload

Запуск команд из-под докера

docker-compose exec backend python /app/src/process_raw_addresses.py

docker-compose exec backend pytest /app/src/test/

docker-compose exec backend isort .

docker-compose exec backend pylint src/

./services/backend/format.sh


Использовать датукласс, только pydentic, без маршмеллоу

Docker Secrets (Swarm) для прода

CI/CD 
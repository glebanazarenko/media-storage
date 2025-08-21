Запуск проекта

docker-compose up -d --build

docker-compose down

Удаление томов

docker-compose down -v

При первом создании

docker-compose exec backend alembic init migrations

При обновлении Миграции

docker-compose exec backend alembic revision --autogenerate -m "описание_изменения"

docker-compose exec backend alembic upgrade head

БД

docker-compose exec db psql -U postgres -d media_storage -c "\dt"
docker-compose exec db psql -U postgres -d media_storage -c "Select count(*) from users"
docker-compose exec db psql -U postgres -d media_storage -c "Select * from users"
docker-compose exec db psql -U postgres -d media_storage -c "Select * from files"
docker-compose exec db psql -U postgres -d media_storage -c "Select * from files WHERE created_at::date = CURRENT_DATE;"
docker-compose exec db psql -U postgres -d media_storage -c "Select * from tags"
docker-compose exec db psql -U postgres -d media_storage -c "Select * from categories"

docker-compose exec db psql -U postgres -d media_storage -c "Select files.thumbnail_path, files.preview_path, files.file_path from files"


Для отладки

docker-compose exec backend sh
uvicorn app.main:app --host 0.0.0.0 --port 5000 --reload
uvicorn src.main:app --host 0.0.0.0 --port 5035 --reload

Запуск команд из-под докера

docker-compose exec backend python /app/src/process_raw_addresses.py

docker-compose exec backend pytest /app/src/test/

docker-compose exec backend isort .

docker-compose exec backend pylint src/

./backend/format.sh


Использовать датукласс, только pydentic, без маршмеллоу

Docker Secrets (Swarm) для прода

CI/CD 

Как на дваче открывание файлов

Сделать бекап и загрузку из него

изменить файл, удалить файл
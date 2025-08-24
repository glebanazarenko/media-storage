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

на телефон сделать

Надо показывать язык мне кажется текущий, добавить переводы

Улучшить перематывание (сейчас скачивается весь файл до момента перемотки)
Загрузка файлов, бекапа и востановление в фоновом режиме (чтобы можно было уходить на другую страницу). Уведомление поверх слева сверху пусть будет
Анимацию загрузки поправить

Прошу добавить загрузку через дашборд а именно возможность дропнуть файл на станице дашборда для переадресации на старницу загрузки файлов 
И вставлять через ctrl + V на странице загрузке

Прошу добавить загрузку через дашборд а именно возможность дропнуть файл на станице дашборда для переадресации на старницу загрузки файлов 
•	Видео
•	Изображение
•	Аудио


Собирать данные о длинне видео и добавить это как фильтр. (Пользователь может хотеть видеть только короткие или длинные видео.) Так же добавить сортировку по длинне от короткого до длинного.

Возможность по дефолту перематывать видео вперёд назад на W и S (уже можно на ↑ и ↓)

чтобы задний фон не двигался когда двигаешь файл

При перелисвание на следующие видео если это последнее видео на странице то перекидывать на следующую

Уровень звука (громкость) сбрасывается при выходе из плеера. Прошу исправить

Убрать выбор стрелочками на вводе номера страницы (фото ниже)

Так же передвинуть ввод страницы и заменить им номер страницы (фото ниже)

Пример сокращения (изначальный тег: woman_talking). Если и сокращять то только последний тег в линейке:

ВПН настроить

Тесты написать на все

Группы 

Бекапы на группы (с сохранением всех ролей и файлов)


Купить домен (например, через reg.ru)
Настроить DNS: A запись для вашего IP
Получить Let's Encrypt сертификат:
bash


1
sudo certbot certonly --standalone -d yourdomain.com
Настроить автоматическое обновление сертификатов
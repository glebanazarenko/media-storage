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
docker-compose exec db psql -U postgres -d media_storage -c "Select * from files LIMIT 1"
docker-compose exec db psql -U postgres -d media_storage -c "UPDATE users SET is_admin = TRUE WHERE username = 'admin';"
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


При загрузке файла сделать выбор, в какую коллекцию добавлять.
Поправить измнение и удаление файла на тех, у кого есть доступ в колеекцию на это. (Editable)
При просмотре file.membersList показывались только текущие, что есть в коллекции. А не все. 
Поправить смену доступа к колецкции в ui
Для readonly не может добавлять свои файлы в коллекцию
В коллекцию не передаю блюр



Загрузка файлов, бекапа и востановление в фоновом режиме (чтобы можно было уходить на другую страницу). Уведомление поверх слева сверху пусть будет
Анимацию загрузки поправить

Прошу добавить загрузку через дашборд а именно возможность дропнуть файл на станице дашборда для переадресации на старницу загрузки файлов 
•	Видео
•	Изображение
•	Аудио

Возможность по дефолту перематывать видео вперёд назад на W и S (уже можно на ↑ и ↓)

Уровень звука (громкость) сбрасывается при выходе из плеера. Прошу исправить

Пример сокращения (изначальный тег: woman_talking). Если и сокращять то только последний тег в линейке:

Сделать вертикальные превью лучше и чище, что бы они полностью показывали что на изображении. Вместо того что бы просто скейлить превью тем самым его обрезая, повер превью которое заскейлилось накладывть блюр и немного его затемнять (это что бы изображения с белым превью не выглядели странно), после чего размещать превью с правильными пропорциями поверх.

Сделать кнопку плей не байтом.

Показывать, что загрузка идет при востановлении бекапа

Удалять видео, фото, файлы определенного пользователя

Добавить предпросмотр кадра на шкалу воспроизведения

Работа с несколькими файлами

ВПН настроить

Тесты написать на все

Группы 

Бекапы на группы (с сохранением всех ролей и файлов)


Купить домен (например, через reg.ru)
Настроить DNS: A запись для вашего IP
Получить Let's Encrypt сертификат:
sudo certbot certonly --standalone -d yourdomain.com
Настроить автоматическое обновление сертификатов
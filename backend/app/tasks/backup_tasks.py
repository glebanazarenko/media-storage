import io
import json
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from celery import Celery
from app.core.config import settings
from app.core.database import get_db_session, s3_client
from app.models.base import Category, File as DBFile, Tag, User, Group, GroupMember, file_group # Импортируем таблицу связи

# Инициализация Celery (настройте URL брокера, например, Redis)
celery_app = Celery('backup_tasks')
celery_app.conf.broker_url = settings.CELERY_BROKER_URL # Добавьте CELERY_BROKER_URL в config.py
celery_app.conf.result_backend = settings.CELERY_RESULT_BACKEND # Добавьте CELERY_RESULT_BACKEND в config.py,


@celery_app.task(bind=True)
def create_backup_task(self, user_id: str, backup_type: str = "user"):
    """
    Celery задача для создания резервной копии.
    backup_type: "user" или "full"
    """
    # self.update_state(state='PROGRESS', meta={'current': 0, 'total': 100}) # Пример прогресса
    try:
        # Получаем текущего пользователя (для метаданных и проверки прав)
        with get_db_session() as db:
            current_user = db.query(User).filter(User.id == user_id).first()
            if not current_user:
                raise ValueError(f"User with id {user_id} not found")

            if backup_type == "full" and not current_user.is_admin:
                raise ValueError("Admin rights required for full backup")

            # Получаем все данные в зависимости от типа бэкапа
            if backup_type == "user":
                files = db.query(DBFile).filter(DBFile.owner_id == current_user.id).all()
                # Получаем теги, используемые в файлах пользователя
                file_ids = [f.id for f in files]
                tags = db.query(Tag).filter(Tag.id.in_([tid for f in files for tid in f.tags])).all()
                # Получаем категории, используемые в файлах пользователя
                category_ids = {f.category_id for f in files if f.category_id}
                categories = db.query(Category).filter(Category.id.in_(category_ids)).all() if category_ids else []
                # Получаем коллекции, к которым принадлежат файлы пользователя
                groups = (
                    db.query(Group)
                    .join(file_group, Group.id == file_group.c.group_id)
                    .filter(file_group.c.file_id.in_(file_ids))
                    .all()
                )
                # Получаем связи файлов с коллекциями
                file_group_links = db.query(file_group).filter(file_group.c.file_id.in_(file_ids)).all()

                # Подготавливаем данные для бэкапа
                backup_data = _prepare_backup_data(current_user, files, tags, categories, groups, file_group_links)

            elif backup_type == "full":
                files = db.query(DBFile).all()
                tags = db.query(Tag).all()
                categories = db.query(Category).all()
                users = db.query(User).all()
                groups = db.query(Group).all()
                group_members = db.query(GroupMember).all()
                file_group_links = db.query(file_group).all()
                backup_data = _prepare_full_backup_data(users, files, tags, categories, groups, group_members, file_group_links)
            else:
                raise ValueError(f"Invalid backup_type: {backup_type}")

        # Создаем ZIP архив и сохраняем его в S3
        s3_backup_key = _create_and_save_zip_to_s3(backup_data, files, backup_type, current_user)

        # Возвращаем ключ S3, где хранится бэкап
        return {"status": "completed", "s3_key": s3_backup_key}

    except Exception as exc:
        # Обновляем статус задачи в случае ошибки
        self.update_state(
            state='FAILURE',
            meta={'exc_type': type(exc).__name__, 'exc_message': str(exc)}
        )
        raise exc # Важно: поднимите исключение, чтобы Celery знал об ошибке

def _prepare_backup_data(current_user, files, tags, categories, groups, file_group_links):
    """Подготавливает данные для бэкапа пользователя"""
    # (Копируем логику из backup_service.py)
    backup_data = {
        "user_id": str(current_user.id),
        "username": current_user.username,
        "backup_date": str(datetime.now(timezone.utc)),
        "backup_type": "user",
        "files": [],
        "tags": [],
        "categories": [],
        "groups": [],
        "group_members": [],
        "file_group_links": [],
    }

    for file in files:
        file_data = {
            "id": str(file.id),
            "original_name": file.original_name,
            "mime_type": file.mime_type,
            "file_path": file.file_path,
            "size": file.size,
            "thumbnail_path": file.thumbnail_path,
            "preview_path": file.preview_path,
            "description": file.description,
            "tags": [str(tid) for tid in file.tags],
            "category_id": str(file.category_id) if file.category_id else None,
            "owner_id": str(file.owner_id),
            "owner_username": current_user.username,
            "created_at": str(file.created_at),
            "updated_at": str(file.updated_at),
            "transcoding_status": file.transcoding_status,
            "duration": file.duration,
            "hls_manifest_path": file.hls_manifest_path,
            "dash_manifest_path": file.dash_manifest_path,
        }
        backup_data["files"].append(file_data)

    for tag in tags:
        tag_data = {
            "id": str(tag.id),
            "name": tag.name,
            "slug": tag.slug,
            "created_at": str(tag.created_at),
            "updated_at": str(tag.updated_at),
        }
        backup_data["tags"].append(tag_data)

    for category in categories:
        category_data = {
            "id": str(category.id),
            "name": category.name,
            "slug": category.slug,
            "description": category.description,
            "created_at": str(category.created_at),
        }
        backup_data["categories"].append(category_data)

    for group in groups:
        group_data = {
            "id": str(group.id),
            "name": group.name,
            "description": group.description,
            "creator_id": str(group.creator_id),
            "access_level": group.access_level,
            "created_at": str(group.created_at),
            "updated_at": str(group.updated_at),
        }
        backup_data["groups"].append(group_data)

    for link in file_group_links:
        link_data = {
            "file_id": str(link.file_id),
            "group_id": str(link.group_id),
        }
        backup_data["file_group_links"].append(link_data)

    return backup_data

def _prepare_full_backup_data(users, files, tags, categories, groups, group_members, file_group_links):
    """Подготавливает данные для полного бэкапа"""
    # (Копируем логику из backup_service.py)
    backup_data = {
        "backup_date": str(datetime.now(timezone.utc)),
        "backup_type": "full",
        "users": [],
        "files": [],
        "tags": [],
        "categories": [],
        "groups": [],
        "group_members": [],
        "file_group_links": [],
    }

    username_to_id = {user.username: str(user.id) for user in users}
    for user in users:
        user_data = {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "password": user.password,
            "created_at": str(user.created_at),
            "updated_at": str(user.updated_at),
        }
        backup_data["users"].append(user_data)

    for file in files:
        owner = next((u for u in users if u.id == file.owner_id), None)
        owner_username = owner.username if owner else "unknown"
        file_data = {
            "id": str(file.id),
            "original_name": file.original_name,
            "mime_type": file.mime_type,
            "file_path": file.file_path,
            "size": file.size,
            "thumbnail_path": file.thumbnail_path,
            "preview_path": file.preview_path,
            "description": file.description,
            "tags": [str(tid) for tid in file.tags],
            "category_id": str(file.category_id) if file.category_id else None,
            "owner_id": str(file.owner_id),
            "owner_username": owner_username,
            "created_at": str(file.created_at),
            "updated_at": str(file.updated_at),
            "transcoding_status": file.transcoding_status,
            "duration": file.duration,
            "hls_manifest_path": file.hls_manifest_path,
            "dash_manifest_path": file.dash_manifest_path,
        }
        backup_data["files"].append(file_data)

    for tag in tags:
        tag_data = {
            "id": str(tag.id),
            "name": tag.name,
            "slug": tag.slug,
            "created_at": str(tag.created_at),
            "updated_at": str(tag.updated_at),
        }
        backup_data["tags"].append(tag_data)

    for category in categories:
        category_data = {
            "id": str(category.id),
            "name": category.name,
            "slug": category.slug,
            "description": category.description,
            "created_at": str(category.created_at),
        }
        backup_data["categories"].append(category_data)

    for group in groups:
        group_data = {
            "id": str(group.id),
            "name": group.name,
            "description": group.description,
            "creator_id": str(group.creator_id),
            "access_level": group.access_level,
            "created_at": str(group.created_at),
            "updated_at": str(group.updated_at),
        }
        backup_data["groups"].append(group_data)

    for member in group_members:
        member_data = {
            "user_id": str(member.user_id),
            "group_id": str(member.group_id),
            "role": member.role,
            "invited_by": str(member.invited_by) if member.invited_by else None,
            "invited_at": str(member.invited_at),
            "accepted_at": str(member.accepted_at) if member.accepted_at else None,
            "revoked_at": str(member.revoked_at) if member.revoked_at else None,
        }
        backup_data["group_members"].append(member_data)

    for link in file_group_links:
        link_data = {
            "file_id": str(link.file_id),
            "group_id": str(link.group_id),
        }
        backup_data["file_group_links"].append(link_data)

    return backup_data

def _download_file_from_s3(file_path: str) -> bytes:
    """Скачивает файл из S3 и возвращает его содержимое"""
    try:
        response = s3_client.get_object(
            Bucket=settings.AWS_S3_BUCKET_NAME, Key=file_path
        )
        return response["Body"].read()
    except ClientError as e:
        raise ValueError(f"Failed to download file from S3: {str(e)}")

def _create_and_save_zip_to_s3(backup_data: dict, files: list, backup_type: str, current_user: User):
    """
    Создает ZIP архив и сохраняет его в S3.
    Возвращает ключ S3, под которым файл был сохранен.
    """
    # Генерируем уникальное имя файла
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    if backup_type == "user":
        filename = f"backup_{current_user.username}_{timestamp}.zip"
    else: # full
        filename = f"full_backup_all_users_{timestamp}.zip"

    # Ключ S3 для сохранения
    s3_backup_key = f"backups/{filename}" # Папка backups в бакете

    zip_buffer = io.BytesIO()
    with tempfile.TemporaryDirectory() as temp_dir:
        zip_path = os.path.join(temp_dir, "backup.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
            json_data = json.dumps(backup_data, indent=2, ensure_ascii=False)
            zip_file.writestr("backup_metadata.json", json_data)

            for file in files:
                try:
                    if file.file_path:
                        file_content = _download_file_from_s3(file.file_path)
                        zip_file.writestr(
                            f"files/{file.id}_{file.original_name}", file_content
                        )
                    if file.thumbnail_path:
                        thumbnail_content = _download_file_from_s3(file.thumbnail_path)
                        zip_file.writestr(
                            f"thumbnails/{file.id}_thumbnail.jpg", thumbnail_content
                        )
                    if file.preview_path:
                        preview_content = _download_file_from_s3(file.preview_path)
                        zip_file.writestr(
                            f"previews/{file.id}_preview.jpg", preview_content
                        )

                    # Обработка транскодированных файлов (HLS)
                    if file.hls_manifest_path:
                        hls_s3_base_parts = file.hls_manifest_path.split('/')
                        if len(hls_s3_base_parts) >= 3:
                            hls_s3_base_key = '/'.join(hls_s3_base_parts[:-1]) + '/'
                            hls_temp_dir = os.path.join(temp_dir, f"hls_files/{file.id}")
                            os.makedirs(hls_temp_dir, exist_ok=True)
                            try:
                                paginator = s3_client.get_paginator('list_objects_v2')
                                pages = paginator.paginate(Bucket=settings.AWS_S3_BUCKET_NAME, Prefix=hls_s3_base_key)
                                for page in pages:
                                    if 'Contents' in page:
                                        for obj in page['Contents']:
                                            s3_key = obj['Key']
                                            relative_s3_key = s3_key[len(hls_s3_base_key):]
                                            if relative_s3_key:
                                                local_file_path = os.path.join(hls_temp_dir, relative_s3_key)
                                                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                                                s3_client.download_file(settings.AWS_S3_BUCKET_NAME, s3_key, local_file_path)
                                                zip_arcname = f"transcoded/{file.id}/hls/{relative_s3_key}"
                                                zip_file.write(local_file_path, arcname=zip_arcname)
                            except ClientError as e:
                                print(f"Warning: Could not backup transcoded files for {file.id}: {str(e)}")

                    # Обработка транскодированных файлов (DASH) - аналогично HLS
                    if file.dash_manifest_path:
                        dash_s3_base_parts = file.dash_manifest_path.split('/')
                        if len(dash_s3_base_parts) >= 3:
                            dash_s3_base_key = '/'.join(dash_s3_base_parts[:-1]) + '/'
                            dash_temp_dir = os.path.join(temp_dir, f"dash_files/{file.id}")
                            os.makedirs(dash_temp_dir, exist_ok=True)
                            try:
                                paginator = s3_client.get_paginator('list_objects_v2')
                                pages = paginator.paginate(Bucket=settings.AWS_S3_BUCKET_NAME, Prefix=dash_s3_base_key)
                                for page in pages:
                                    if 'Contents' in page:
                                        for obj in page['Contents']:
                                            s3_key = obj['Key']
                                            relative_s3_key = s3_key[len(dash_s3_base_key):]
                                            if relative_s3_key:
                                                local_file_path = os.path.join(dash_temp_dir, relative_s3_key)
                                                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                                                s3_client.download_file(settings.AWS_S3_BUCKET_NAME, s3_key, local_file_path)
                                                zip_arcname = f"transcoded/{file.id}/dash/{relative_s3_key}"
                                                zip_file.write(local_file_path, arcname=zip_arcname)
                            except ClientError as e:
                                print(f"Warning: Could not backup DASH files for {file.id}: {str(e)}")

                except Exception as e:
                    print(f"Warning: Could not backup file {file.id}: {str(e)}")

        # Читаем созданный ZIP в буфер
        with open(zip_path, 'rb') as f:
            zip_buffer.write(f.read())

    # Загружаем ZIP-архив в S3
    zip_buffer.seek(0)
    s3_client.put_object(
        Bucket=settings.AWS_S3_BUCKET_NAME,
        Key=s3_backup_key,
        Body=zip_buffer.getvalue(),
        ContentType='application/zip'
    )

    print(f"Backup saved to S3: {s3_backup_key}")
    return s3_backup_key

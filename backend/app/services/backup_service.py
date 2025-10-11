import io
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile
from app.core.config import settings
from app.core.database import get_db_session, s3_client
from app.models.base import Category
from app.models.base import File as DBFile
from app.models.base import Tag, User, Group, GroupMember
from app.models.base import file_group # Импортируем таблицу связи
from app.tasks.backup_tasks import create_backup_task


class BackupService:
    def _download_file_from_s3(self, file_path: str) -> bytes:
        """Скачивает файл из S3 и возвращает его содержимое"""
        try:
            response = s3_client.get_object(
                Bucket=settings.AWS_S3_BUCKET_NAME, Key=file_path
            )
            return response["Body"].read()
        except ClientError as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to download file from S3: {str(e)}"
            )

    def create_backup(self, current_user: User) -> str: # Теперь возвращает ID задачи
        """Запускает задачу создания бэкапа для пользователя и возвращает ID задачи"""
        # Запускаем задачу Celery асинхронно
        task = create_backup_task.delay(user_id=str(current_user.id), backup_type="user")
        return task.id # Возвращаем ID задачи

    def create_full_backup(self, current_user: User) -> str: # Теперь возвращает ID задачи
        """Запускает задачу создания полного бэкапа и возвращает ID задачи"""
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Admin rights required for full backup")
        # Запускаем задачу Celery асинхронно
        task = create_backup_task.delay(user_id=str(current_user.id), backup_type="full")
        return task.id # Возвращаем ID задачи

    def _prepare_backup_data(
        self,
        current_user: User,
        files: List[DBFile],
        tags: List[Tag],
        categories: List[Category],
        groups: List[Group],
        file_group_links: List # Список кортежей (file_id, group_id)
    ) -> Dict[str, Any]:
        """Подготавливает данные для бэкапа пользователя"""
        backup_data = {
            "user_id": str(current_user.id),
            "username": current_user.username,
            "backup_date": str(datetime.now(timezone.utc)),
            "backup_type": "user",
            "files": [],
            "tags": [],
            "categories": [],
            "groups": [], # Новые данные
            "group_members": [], # Новые данные
            "file_group_links": [], # Новые данные
        }

        # Добавляем файлы
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
                "tags": [str(tid) for tid in file.tags], # Конвертируем в строки
                "category_id": str(file.category_id) if file.category_id else None,
                "owner_id": str(file.owner_id),
                "owner_username": current_user.username,  # Добавляем username для сопоставления
                "created_at": str(file.created_at),
                "updated_at": str(file.updated_at),
                "transcoding_status": file.transcoding_status,
                "duration": file.duration,
                "hls_manifest_path": file.hls_manifest_path,
                "dash_manifest_path": file.dash_manifest_path,
            }
            backup_data["files"].append(file_data)

        # Добавляем теги
        for tag in tags:
            tag_data = {
                "id": str(tag.id),
                "name": tag.name,
                "slug": tag.slug,
                "created_at": str(tag.created_at),
                "updated_at": str(tag.updated_at),
            }
            backup_data["tags"].append(tag_data)

        # Добавляем категории
        for category in categories:
            category_data = {
                "id": str(category.id),
                "name": category.name,
                "slug": category.slug,
                "description": category.description,
                "created_at": str(category.created_at),
            }
            backup_data["categories"].append(category_data)

        # Добавляем коллекции
        for group in groups:
            group_data = {
                "id": str(group.id),
                "name": group.name,
                "description": group.description,
                "creator_id": str(group.creator_id),
                "access_level": group.access_level, # Уровень доступа может быть неактуален, но сохраняем
                "created_at": str(group.created_at),
                "updated_at": str(group.updated_at),
            }
            backup_data["groups"].append(group_data)

        # Добавляем связи файлов с коллекциями
        for link in file_group_links:
            link_data = {
                "file_id": str(link.file_id),
                "group_id": str(link.group_id),
            }
            backup_data["file_group_links"].append(link_data)

        return backup_data

    def _prepare_full_backup_data(
        self,
        users: List[User],
        files: List[DBFile],
        tags: List[Tag],
        categories: List[Category],
        groups: List[Group],
        group_members: List[GroupMember],
        file_group_links: List # Список кортежей (file_id, group_id)
    ) -> Dict[str, Any]:
        """Подготавливает данные для полного бэкапа"""
        backup_data = {
            "backup_date": str(datetime.now(timezone.utc)),
            "backup_type": "full",
            "users": [],
            "files": [],
            "tags": [],
            "categories": [],
            "groups": [],
            "group_members": [],
            "file_group_links": [], # Новые данные
        }

        # Добавляем пользователей
        for user in users:
            user_data = {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "is_active": user.is_active,
                "is_admin": user.is_admin,
                "password": user.password,  # Хэш пароля
                "created_at": str(user.created_at),
                "updated_at": str(user.updated_at),
            }
            backup_data["users"].append(user_data)

        # Добавляем файлы
        # Создаем mapping username -> user_id для восстановления
        username_to_id = {user.username: str(user.id) for user in users}
        
        for file in files:
            # Получаем владельца файла
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
                "tags": [str(tid) for tid in file.tags], # Конвертируем в строки
                "category_id": str(file.category_id) if file.category_id else None,
                "owner_id": str(file.owner_id),
                "owner_username": owner_username,  # Используем username для сопоставления
                "created_at": str(file.created_at),
                "updated_at": str(file.updated_at),
                "transcoding_status": file.transcoding_status,
                "duration": file.duration,
                "hls_manifest_path": file.hls_manifest_path,
                "dash_manifest_path": file.dash_manifest_path,
            }
            backup_data["files"].append(file_data)

        # Добавляем теги
        for tag in tags:
            tag_data = {
                "id": str(tag.id),
                "name": tag.name,
                "slug": tag.slug,
                "created_at": str(tag.created_at),
                "updated_at": str(tag.updated_at),
            }
            backup_data["tags"].append(tag_data)

        # Добавляем категории
        for category in categories:
            category_data = {
                "id": str(category.id),
                "name": category.name,
                "slug": category.slug,
                "description": category.description,
                "created_at": str(category.created_at),
            }
            backup_data["categories"].append(category_data)

        # Добавляем коллекции
        for group in groups:
            group_data = {
                "id": str(group.id),
                "name": group.name,
                "description": group.description,
                "creator_id": str(group.creator_id),
                "access_level": group.access_level, # Уровень доступа может быть неактуален, но сохраняем
                "created_at": str(group.created_at),
                "updated_at": str(group.updated_at),
            }
            backup_data["groups"].append(group_data)

        # Добавляем участников коллекций
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

        # Добавляем связи файлов с коллекциями
        for link in file_group_links:
            link_data = {
                "file_id": str(link.file_id),
                "group_id": str(link.group_id),
            }
            backup_data["file_group_links"].append(link_data)

        return backup_data

    def _create_zip_archive(
        self, backup_data: Dict[str, Any], files: List[DBFile]
    ) -> io.BytesIO:
        """Создает ZIP архив с данными бэкапа"""
        try:
            zip_buffer = io.BytesIO()
            with tempfile.TemporaryDirectory() as temp_dir: # Используем временную директорию
                zip_path = os.path.join(temp_dir, "backup.zip")
                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    # Добавляем JSON с метаданными
                    json_data = json.dumps(backup_data, indent=2, ensure_ascii=False)
                    zip_file.writestr("backup_metadata.json", json_data)

                    # Добавляем реальные файлы из S3
                    for file in files:
                        try:
                            # Добавляем основной файл
                            if file.file_path:
                                file_content = self._download_file_from_s3(file.file_path)
                                zip_file.writestr(
                                    f"files/{file.id}_{file.original_name}", file_content
                                )
                            # Добавляем thumbnail, если есть
                            if file.thumbnail_path:
                                thumbnail_content = self._download_file_from_s3(
                                    file.thumbnail_path
                                )
                                zip_file.writestr(
                                    f"thumbnails/{file.id}_thumbnail.jpg", thumbnail_content
                                )
                            # Добавляем preview, если есть
                            if file.preview_path:
                                preview_content = self._download_file_from_s3(file.preview_path)
                                zip_file.writestr(
                                    f"previews/{file.id}_preview.jpg", preview_content
                                )

                            # Добавляем транскодированные файлы ---
                            if file.hls_manifest_path:
                                # Определяем базовый путь к транскодированным данным в S3
                                # hls_manifest_path обычно выглядит как transcoded/<file_id>/hls/master.m3u8
                                # Нам нужна папка transcoded/<file_id>/hls/
                                hls_s3_base_parts = file.hls_manifest_path.split('/')
                                if len(hls_s3_base_parts) >= 3:
                                    hls_s3_base_key = '/'.join(hls_s3_base_parts[:-1]) + '/' # Путь к папке hls
                                    # Создаем временную папку для транскодированных файлов этого файла
                                    hls_temp_dir = os.path.join(temp_dir, f"hls_files/{file.id}")
                                    os.makedirs(hls_temp_dir, exist_ok=True)

                                    try:
                                        # Список объектов в S3 по префиксу
                                        paginator = s3_client.get_paginator('list_objects_v2')
                                        pages = paginator.paginate(Bucket=settings.AWS_S3_BUCKET_NAME, Prefix=hls_s3_base_key)

                                        for page in pages:
                                            if 'Contents' in page:
                                                for obj in page['Contents']:
                                                    s3_key = obj['Key']
                                                    # Скачиваем файл во временную папку
                                                    # Вычисляем относительный путь внутри папки транскодирования
                                                    relative_s3_key = s3_key[len(hls_s3_base_key):] # Убираем базовый префикс
                                                    if relative_s3_key: # Убедимся, что ключ не пустой (это сама папка)
                                                        local_file_path = os.path.join(hls_temp_dir, relative_s3_key)
                                                        os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                                                        s3_client.download_file(settings.AWS_S3_BUCKET_NAME, s3_key, local_file_path)
                                                        # Добавляем файл в ZIP, сохраняя структуру папок
                                                        zip_arcname = f"transcoded/{file.id}/hls/{relative_s3_key}"
                                                        zip_file.write(local_file_path, arcname=zip_arcname)

                                    except ClientError as e:
                                        print(f"Warning: Could not backup transcoded files for {file.id}: {str(e)}")
                                        # Продолжаем, даже если транскодированные файлы не удалось забэкапить

                        except Exception as e:
                            print(f"Warning: Could not backup file {file.id}: {str(e)}")
                            # Продолжаем с другими файлами даже если один не удался

                # Читаем содержимое временного zip файла в BytesIO
                with open(zip_path, 'rb') as f:
                    zip_buffer.write(f.read())
                zip_buffer.seek(0)
                return zip_buffer
        except Exception as e:
            print(f"Zip error: {e}")
            raise e
    
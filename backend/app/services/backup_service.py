import io
import json
import os
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
from app.models.base import Tag, User


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

    def create_backup(self, current_user: User) -> Tuple[io.BytesIO, str]:
        """Создает бэкап всех файлов пользователя и возвращает ZIP архив и имя файла"""
        try:
            # Получаем все файлы пользователя и связанные данные
            with get_db_session() as db:
                files = (
                    db.query(DBFile).filter(DBFile.owner_id == current_user.id).all()
                )
                tags = db.query(Tag).all()
                categories = db.query(Category).all()

                # Создаем структуру данных для бэкапа
                backup_data = self._prepare_backup_data(
                    current_user, files, tags, categories
                )

                # Создаем ZIP архив
                zip_buffer = self._create_zip_archive(backup_data, files)

                filename = f"backup_{current_user.username}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"

                return zip_buffer, filename

        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Backup creation failed: {str(e)}"
            )

    def create_full_backup(self, current_user: User) -> Tuple[io.BytesIO, str]:
        """Создает полный бэкап всех данных системы (только для админов)"""
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Admin rights required for full backup")
        
        try:
            # Получаем все данные системы
            with get_db_session() as db:
                files = db.query(DBFile).all()
                tags = db.query(Tag).all()
                categories = db.query(Category).all()
                users = db.query(User).all()

                # Создаем структуру данных для полного бэкапа
                backup_data = self._prepare_full_backup_data(
                    users, files, tags, categories
                )

                # Создаем ZIP архив
                zip_buffer = self._create_zip_archive(backup_data, files)

                filename = f"full_backup_all_users_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"

                return zip_buffer, filename

        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Full backup creation failed: {str(e)}"
            )

    def _prepare_backup_data(
        self,
        current_user: User,
        files: List[DBFile],
        tags: List[Tag],
        categories: List[Category],
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
                "tags": file.tags,
                "category_id": str(file.category_id) if file.category_id else None,
                "owner_id": str(file.owner_id),
                "owner_username": current_user.username,  # Добавляем username для сопоставления
                "created_at": str(file.created_at),
                "updated_at": str(file.updated_at),
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

        return backup_data

    def _prepare_full_backup_data(
        self,
        users: List[User],
        files: List[DBFile],
        tags: List[Tag],
        categories: List[Category],
    ) -> Dict[str, Any]:
        """Подготавливает данные для полного бэкапа"""
        backup_data = {
            "backup_date": str(datetime.now(timezone.utc)),
            "backup_type": "full",
            "users": [],
            "files": [],
            "tags": [],
            "categories": [],
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
                "tags": file.tags,
                "category_id": str(file.category_id) if file.category_id else None,
                "owner_id": str(file.owner_id),
                "owner_username": owner_username,  # Используем username для сопоставления
                "created_at": str(file.created_at),
                "updated_at": str(file.updated_at),
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

        return backup_data

    def _create_zip_archive(
        self, backup_data: Dict[str, Any], files: List[DBFile]
    ) -> io.BytesIO:
        """Создает ZIP архив с данными бэкапа"""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
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

                except Exception as e:
                    print(f"Warning: Could not backup file {file.id}: {str(e)}")
                    # Продолжаем с другими файлами даже если один не удался

        zip_buffer.seek(0)
        return zip_buffer

    async def restore_backup(
        self, backup_file: UploadFile, current_user: User
    ) -> Dict[str, Any]:
        """Восстанавливает данные из бэкап файла"""
        try:
            # Создаем временную директорию для распаковки
            with tempfile.TemporaryDirectory() as temp_dir:
                # Сохраняем загруженный файл
                file_path = os.path.join(temp_dir, "backup.zip")
                with open(file_path, "wb") as buffer:
                    content = await backup_file.read()
                    buffer.write(content)

                # Распаковываем ZIP архив
                with zipfile.ZipFile(file_path, "r") as zip_ref:
                    zip_ref.extractall(temp_dir)

                # Читаем метаданные
                metadata_path = os.path.join(temp_dir, "backup_metadata.json")
                if not os.path.exists(metadata_path):
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid backup file: metadata not found",
                    )

                with open(metadata_path, "r", encoding="utf-8") as f:
                    backup_data = json.load(f)

                # Проверяем тип бэкапа и права доступа
                backup_type = backup_data.get("backup_type", "user")
                if backup_type == "full" and not current_user.is_admin:
                    raise HTTPException(
                        status_code=403,
                        detail="Only administrators can restore full backups"
                    )

                restored_files = 0

                # Восстанавливаем данные
                with get_db_session() as db:
                    # Для полного бэкапа восстанавливаем пользователей
                    if backup_type == "full":
                        restored_files += self._restore_users(
                            db, backup_data.get("users", [])
                        )

                    # Восстанавливаем категории
                    restored_files += self._restore_categories(
                        db, backup_data.get("categories", [])
                    )

                    # Восстанавливаем теги
                    restored_files += self._restore_tags(
                        db, backup_data.get("tags", [])
                    )

                    # Создаем mapping username -> user_id для текущего состояния БД
                    username_to_id = {}
                    if backup_type == "full":
                        # Для полного бэкапа используем восстановленных или существующих пользователей
                        users = db.query(User).all()
                        username_to_id = {user.username: str(user.id) for user in users}
                    else:
                        # Для пользовательского бэкапа используем текущего пользователя
                        username_to_id = {current_user.username: str(current_user.id)}

                    # Восстанавливаем файлы
                    restored_files += await self._restore_files(
                        db, backup_data.get("files", []), temp_dir, current_user, backup_type, username_to_id
                    )

                    db.commit()

                return {
                    "message": "Backup restored successfully",
                    "restored_files": restored_files,
                    "total_files": len(backup_data.get("files", [])),
                }

        except Exception as e:
            import traceback

            print(f"Backup restore error: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Backup restore failed: {str(e)}"
            )

    def _restore_users(self, db, users_data: List[Dict]) -> int:
        """Восстанавливает пользователей (только для полного бэкапа)"""
        restored_count = 0
        for user_data in users_data:
            # Проверяем, существует ли пользователь с таким email или username
            existing_user = db.query(User).filter(
                (User.email == user_data["email"]) | 
                (User.username == user_data["username"])
            ).first()

            if not existing_user:
                new_user = User(
                    id=uuid.UUID(user_data["id"]),
                    username=user_data["username"],
                    email=user_data["email"],
                    password=user_data["password"],  # Хэш пароля
                    is_active=user_data["is_active"],
                    is_admin=user_data["is_admin"],
                    created_at=user_data["created_at"],
                    updated_at=user_data["updated_at"],
                )
                db.add(new_user)
                restored_count += 1
        return restored_count

    def _restore_categories(self, db, categories_data: List[Dict]) -> int:
        """Восстанавливает категории"""
        restored_count = 0
        for category_data in categories_data:
            # Проверяем по ID
            existing_category = (
                db.query(Category)
                .filter(Category.id == category_data["id"])
                .first()
            )
            
            # Если не найдено по ID, проверяем по имени
            if not existing_category:
                existing_category = (
                    db.query(Category)
                    .filter(Category.name == category_data["name"])
                    .first()
                )

            if not existing_category:
                new_category = Category(
                    id=uuid.UUID(category_data["id"]),
                    name=category_data["name"],
                    slug=category_data["slug"],
                    description=category_data.get("description"),
                    created_at=category_data["created_at"],
                )
                db.add(new_category)
                restored_count += 1
        return restored_count

    def _restore_tags(self, db, tags_data: List[Dict]) -> int:
        """Восстанавливает теги"""
        restored_count = 0
        for tag_data in tags_data:
            # Проверяем по ID
            existing_tag = db.query(Tag).filter(Tag.id == tag_data["id"]).first()
            
            # Если не найдено по ID, проверяем по имени
            if not existing_tag:
                existing_tag = db.query(Tag).filter(Tag.name == tag_data["name"]).first()

            if not existing_tag:
                new_tag = Tag(
                    id=uuid.UUID(tag_data["id"]),
                    name=tag_data["name"],
                    slug=tag_data["slug"],
                    created_at=tag_data["created_at"],
                    updated_at=tag_data["updated_at"],
                )
                db.add(new_tag)
                restored_count += 1
        return restored_count

    async def _restore_files(
        self, db, files_data: List[Dict], temp_dir: str, current_user: User, backup_type: str, username_to_id: Dict[str, str]
    ) -> int:
        """Восстанавливает файлы"""
        restored_count = 0
        for file_data in files_data:
            try:
                # Проверяем, существует ли файл
                existing_file = (
                    db.query(DBFile).filter(DBFile.id == file_data["id"]).first()
                )

                if not existing_file:
                    # Для пользовательского бэкапа проверяем права доступа через username
                    owner_username = file_data.get("owner_username", current_user.username)
                    
                    # Определяем владельца файла
                    if backup_type == "user":
                        # Для пользовательского бэкапа все файлы принадлежат текущему пользователю
                        owner_id = current_user.id
                    else:
                        # Для полного бэкапа ищем пользователя по username
                        owner_id_str = username_to_id.get(owner_username)
                        if owner_id_str:
                            owner_id = uuid.UUID(owner_id_str)
                        else:
                            # Если пользователь не найден, пропускаем файл
                            continue
                    
                    # Ищем файл в распакованном архиве и восстанавливаем его
                    file_restored = await self._restore_single_file(
                        db, file_data, temp_dir, owner_id
                    )
                    if file_restored:
                        restored_count += 1

            except Exception as e:
                print(
                    f"Warning: Could not restore file {file_data.get('id', 'unknown')}: {str(e)}"
                )
        return restored_count

    async def _restore_single_file(
        self, db, file_data: Dict, temp_dir: str, owner_id: uuid.UUID
    ) -> bool:
        """Восстанавливает один файл"""
        # Ищем файл в распакованном архиве
        file_content = None
        thumbnail_content = None
        preview_content = None

        # Ищем основной файл
        possible_file_paths = [
            os.path.join(
                temp_dir,
                "files",
                f"{file_data['id']}_{file_data['original_name']}",
            ),
            os.path.join(
                temp_dir,
                f"files/{file_data['id']}_{file_data['original_name']}",
            ),
            os.path.join(temp_dir, file_data["original_name"]),
        ]

        for path in possible_file_paths:
            if os.path.exists(path):
                with open(path, "rb") as f:
                    file_content = f.read()
                break

        # Ищем thumbnail
        if file_data.get("thumbnail_path"):
            possible_thumb_paths = [
                os.path.join(
                    temp_dir,
                    "thumbnails",
                    f"{file_data['id']}_thumbnail.jpg",
                ),
                os.path.join(
                    temp_dir,
                    f"thumbnails/{file_data['id']}_thumbnail.jpg",
                ),
            ]

            for path in possible_thumb_paths:
                if os.path.exists(path):
                    with open(path, "rb") as f:
                        thumbnail_content = f.read()
                    break

        # Ищем preview
        if file_data.get("preview_path"):
            possible_preview_paths = [
                os.path.join(
                    temp_dir,
                    "previews",
                    f"{file_data['id']}_preview.jpg",
                ),
                os.path.join(
                    temp_dir,
                    f"previews/{file_data['id']}_preview.jpg",
                ),
            ]

            for path in possible_preview_paths:
                if os.path.exists(path):
                    with open(path, "rb") as f:
                        preview_content = f.read()
                    break

        # Загружаем файлы в S3 если они найдены
        file_uploaded = False
        thumbnail_uploaded = False
        preview_uploaded = False

        if file_content:
            try:
                s3_client.put_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME,
                    Key=file_data["file_path"],
                    Body=file_content,
                )
                file_uploaded = True
            except Exception as e:
                print(f"Failed to upload file to S3: {str(e)}")

        if thumbnail_content and file_data.get("thumbnail_path"):
            try:
                s3_client.put_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME,
                    Key=file_data["thumbnail_path"],
                    Body=thumbnail_content,
                )
                thumbnail_uploaded = True
            except Exception as e:
                print(f"Failed to upload thumbnail to S3: {str(e)}")

        if preview_content and file_data.get("preview_path"):
            try:
                s3_client.put_object(
                    Bucket=settings.AWS_S3_BUCKET_NAME,
                    Key=file_data["preview_path"],
                    Body=preview_content,
                )
                preview_uploaded = True
            except Exception as e:
                print(f"Failed to upload preview to S3: {str(e)}")

        # Создаем запись в БД только если основной файл успешно загружен
        if file_uploaded:
            # Обрабатываем category_id
            category_id = None
            if file_data.get("category_id"):
                try:
                    category_id = uuid.UUID(file_data["category_id"])
                except (ValueError, TypeError):
                    category_id = None

            new_file = DBFile(
                id=uuid.UUID(file_data["id"]),
                original_name=file_data["original_name"],
                mime_type=file_data["mime_type"],
                file_path=file_data["file_path"],
                size=file_data["size"],
                thumbnail_path=file_data.get("thumbnail_path")
                if thumbnail_uploaded
                else None,
                preview_path=file_data.get("preview_path")
                if preview_uploaded
                else None,
                description=file_data.get("description"),
                tags=file_data["tags"],
                category_id=category_id,
                owner_id=owner_id,  # Используем правильный owner_id
                created_at=file_data["created_at"],
                updated_at=file_data["updated_at"],
            )
            db.add(new_file)
            return True

        return False

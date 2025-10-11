from app.celery_app import celery_app
import io
import json
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
from botocore.exceptions import ClientError
from app.core.database import get_db_session, s3_client
from fastapi import HTTPException, UploadFile
from app.models.base import Tag, User, Group, GroupMember, Category, File as DBFile
from app.models.base import file_group # Импортируем таблицу связи
from app.core.config import settings # Добавьте импорт settings

@celery_app.task(bind=True)
def restore_backup_task(self, s3_key: str, user_id: str, should_delete_s3_key: bool = True): # Добавлен параметр
    local_temp_file_path = None
    try:
        print(f"Starting restore task for S3 key: {s3_key}, delete_after: {should_delete_s3_key}") # Для отладки

        # Скачиваем файл из S3 в локальный временный файл
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            # Получаем объект из S3
            response = s3_client.get_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key)
            # Читаем содержимое
            file_content = response['Body'].read()
            # Записываем в локальный временный файл
            temp_file.write(file_content)
            local_temp_file_path = temp_file.name

        print(f"Downloaded S3 file {s3_key} to local temp file: {local_temp_file_path}") # Для отладки

        # Теперь вызываем основную логику восстановления, передавая путь к локальному файлу
        service = BackupService()
        result = service.restore_backup_from_path(local_temp_file_path, user_id)

        if isinstance(result, dict) and "error" in result:
            raise Exception(result["error"])

        print(f"Restore task completed successfully for S3 key: {s3_key}") # Для отладки
        return result

    except Exception as e:
        print(f"Error in restore_backup_task: {e}")
        # Возвращаем ошибку, чтобы фронтенд мог обработать её
        return {"error": str(e), "message": "Backup restore failed"}
    finally:
        # Удаляем локальный временный файл
        if local_temp_file_path and os.path.exists(local_temp_file_path):
            try:
                os.unlink(local_temp_file_path)
                print(f"Local temporary file {local_temp_file_path} deleted after task completion.")
            except OSError as e:
                print(f"Warning: Could not delete local temporary file {local_temp_file_path}: {e}")
        else:
            print(f"Local temporary file was already deleted or never existed: {local_temp_file_path}")

        # Удаляем файл из S3 ТОЛЬКО если флаг указывает на это
        if should_delete_s3_key:
            try:
                s3_client.delete_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_key)
                print(f"S3 temp file {s3_key} deleted after task completion.")
            except Exception as s3_cleanup_error:
                print(f"Warning: Could not delete S3 temp file {s3_key}: {s3_cleanup_error}")
        else:
            print(f"S3 file {s3_key} was not deleted as it was not created by this process.")

class BackupService:
    def restore_backup_from_path(self, file_path: str, user_id: str) -> Dict[str, Any]:
        """Основная логика восстановления бэкапа из файла на диске"""
        try:

            with get_db_session() as db:
                current_user = db.query(User).filter(User.id == user_id).first()

                if not current_user:
                    raise ValueError("User not found")
            
            with tempfile.TemporaryDirectory() as temp_dir:
                # Распаковываем ZIP архив
                with zipfile.ZipFile(file_path, "r") as zip_ref:
                    zip_ref.extractall(temp_dir)

                # Читаем метаданные
                metadata_path = os.path.join(temp_dir, "backup_metadata.json")
                if not os.path.exists(metadata_path):
                    raise ValueError("Invalid backup file: metadata not found")

                with open(metadata_path, "r", encoding="utf-8") as f:
                    backup_data = json.load(f)

                # Проверяем тип бэкапа и права доступа
                backup_type = backup_data.get("backup_type", "user")
                if backup_type == "full" and not current_user.is_admin:
                    raise ValueError("Only administrators can restore full backups")

                restored_files = 0

                # Восстанавливаем данные
                with get_db_session() as db:
                    # Создаём маппинг из бэкапа в текущую БД
                    backup_user_id_to_db_user_id = {}
                    backup_file_id_to_db_file_id = {} # Новый маппинг для файлов
                    backup_group_id_to_db_group_id = {} # Новый маппинг для групп
                    # Заполняем из существующих пользователей
                    existing_users = db.query(User).all()
                    for u in existing_users:
                        backup_user_id_to_db_user_id[str(u.id)] = u.id # Если backup_data содержит ID, сопоставляем с собой

                    # Для full backup восстанавливаем пользователей
                    if backup_type == "full":
                        restored_users_backup_data = backup_data.get("users", [])
                        restored_user_count = self._restore_users(
                            db, restored_users_backup_data, backup_user_id_to_db_user_id
                        )
                        # _restore_users теперь обновляет маппинг
                    else: # user backup
                        # Для user backup, добавим маппинг для текущего пользователя
                        backup_user_id_to_db_user_id[backup_data.get("user_id", str(current_user.id))] = current_user.id

                    # Восстанавливаем коллекции
                    restored_files += self._restore_groups(
                        db, backup_data.get("groups", []), current_user, backup_type, backup_user_id_to_db_user_id, backup_group_id_to_db_group_id
                    )

                    # Восстанавливаем участников коллекций
                    if backup_type == "full":
                        self._restore_group_members(
                            db, backup_data.get("group_members", []), backup_user_id_to_db_user_id, backup_group_id_to_db_group_id
                        )

                    # Восстанавливаем категории
                    restored_files += self._restore_categories(
                        db, backup_data.get("categories", [])
                    )

                    # Восстанавливаем теги
                    restored_files += self._restore_tags(
                        db, backup_data.get("tags", [])
                    )

                    # Восстанавливаем файлы
                    restored_files += self._restore_files_sync(
                        db, backup_data.get("files", []), temp_dir, current_user, backup_type, backup_user_id_to_db_user_id, backup_file_id_to_db_file_id
                    )

                    # Восстанавливаем связи файлов с коллекциями
                    self._restore_file_group_links(
                        db, backup_data.get("file_group_links", []), backup_file_id_to_db_file_id, backup_group_id_to_db_group_id
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
            raise ValueError(f"Backup restore failed: {str(e)}")

    def _restore_users(self, db, users_data: List[Dict], backup_user_id_to_db_user_id: Dict[str, uuid.UUID]) -> int:
        """Восстанавливает пользователей (только для полного бэкапа) и обновляет маппинг"""
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
                # Обновляем маппинг: ID из бэкапа -> ID в текущей БД (новый UUID)
                backup_user_id_to_db_user_id[user_data["id"]] = new_user.id
                restored_count += 1
            else:
                # Если пользователь существует, всё равно обновляем маппинг: ID из бэкапа -> ID в текущей БД
                backup_user_id_to_db_user_id[user_data["id"]] = existing_user.id
        return restored_count

    def _restore_groups(self, db, groups_data: List[Dict], current_user: User, backup_type: str, backup_user_id_to_db_user_id: Dict[str, uuid.UUID], backup_group_id_to_db_group_id: Dict[str, uuid.UUID]) -> int:
        """Восстанавливает коллекции (группы)"""
        restored_count = 0
        for group_data in groups_data:
            # Проверяем, существует ли коллекция
            existing_group = db.query(Group).filter(Group.id == group_data["id"]).first()
            if not existing_group:
                # Получаем creator_id из бэкапа
                backup_creator_id_str = group_data["creator_id"]
                # Используем маппинг, чтобы найти ID в текущей БД
                db_creator_id = backup_user_id_to_db_user_id.get(backup_creator_id_str)

                if not db_creator_id:
                    # Если не найден в маппинге, проверим, существует ли пользователь с этим ID напрямую в БД (на всякий случай)
                    direct_user_check = db.query(User).filter(User.id == uuid.UUID(backup_creator_id_str)).first()
                    if direct_user_check:
                        # Если нашли, добавим в маппинг и используем
                        backup_user_id_to_db_user_id[backup_creator_id_str] = direct_user_check.id
                        db_creator_id = direct_user_check.id
                    else:
                        print(f"Warning: Creator {backup_creator_id_str} for group {group_data['id']} does not exist in backup mapping or DB. Skipping group.")
                        continue

                # Создаём новую группу
                new_group = Group(
                    id=uuid.UUID(group_data["id"]),
                    name=group_data["name"],
                    description=group_data["description"],
                    creator_id=db_creator_id, # Используем ID из текущей БД
                    # access_level не используется как поле в модели Group, но сохранено в бэкапе
                    # его можно восстановить, если потребуется, но сейчас игнорируем
                    # access_level=group_data.get("access_level", "reader"),
                )
                db.add(new_group)
                # Обновляем маппинг: ID группы из бэкапа -> ID новой группы в БД
                backup_group_id_to_db_group_id[group_data["id"]] = new_group.id
                restored_count += 1
            else:
                # Если группа уже существует, всё равно обновляем маппинг: ID из бэкапа -> ID в текущей БД
                backup_group_id_to_db_group_id[group_data["id"]] = existing_group.id
        return restored_count

    def _restore_group_members(self, db, members_data: List[Dict], backup_user_id_to_db_user_id: Dict[str, uuid.UUID], backup_group_id_to_db_group_id: Dict[str, uuid.UUID]):
        """Восстанавливает участников коллекций (только для полного бэкапа)"""
        for member_data in members_data:
            # Проверяем, существует ли связь
            existing_member = db.query(GroupMember).filter(
                GroupMember.user_id == member_data["user_id"],
                GroupMember.group_id == member_data["group_id"]
            ).first()
            if not existing_member:
                # Получаем user_id и group_id из бэкапа
                backup_user_id_str = member_data["user_id"]
                backup_group_id_str = member_data["group_id"]
                # Используем маппинг, чтобы найти ID в текущей БД
                db_user_id = backup_user_id_to_db_user_id.get(backup_user_id_str)
                # Используем маппинг для группы
                db_group_id = backup_group_id_to_db_group_id.get(backup_group_id_str)

                if not db_user_id:
                    print(f"Warning: User {backup_user_id_str} for group member does not exist in backup mapping. Skipping member.")
                    continue
                if not db_group_id:
                    print(f"Warning: Group {backup_group_id_str} for group member does not exist in backup mapping. Skipping member.")
                    continue

                # Проверяем, существуют ли пользователь и группа в БД
                user_exists = db.query(User).filter(User.id == db_user_id).first() is not None
                group_exists = db.query(Group).filter(Group.id == db_group_id).first() is not None
                if user_exists and group_exists:
                    new_member = GroupMember(
                        user_id=db_user_id,
                        group_id=db_group_id,
                        role=member_data["role"],
                        invited_by=uuid.UUID(member_data["invited_by"]) if member_data.get("invited_by") else None,
                        invited_at=member_data["invited_at"],
                        accepted_at=member_data["accepted_at"],
                        revoked_at=member_data["revoked_at"],
                    )
                    db.add(new_member)

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

    def _restore_files_sync(
        self, db, files_data: List[Dict], temp_dir: str, current_user: User, backup_type: str, backup_user_id_to_db_user_id: Dict[str, uuid.UUID], backup_file_id_to_db_file_id: Dict[str, uuid.UUID]
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
                        # Используем маппинг, но если owner_id из бэкапа - это current_user.id, то db_owner_id = current_user.id
                        backup_owner_id_str = file_data["owner_id"]
                        if backup_owner_id_str == str(current_user.id):
                             db_owner_id = current_user.id
                        else:
                            # Если файл в user backup принадлежит не текущему пользователю, это ошибка
                            print(f"Warning (User Backup): File {file_data.get('id', 'unknown')} owner mismatch. Skipping.")
                            continue
                    else: # backup_type == "full"
                        # Для полного бэкапа ищем пользователя по backup_user_id_to_db_user_id
                        backup_owner_id_str = file_data["owner_id"]
                        db_owner_id = backup_user_id_to_db_user_id.get(backup_owner_id_str)
                        if not db_owner_id:
                            # Если пользователь не найден, пропускаем файл
                            print(f"Warning (Full Backup): Owner {backup_owner_id_str} for file {file_data.get('id', 'unknown')} does not exist in backup mapping. Skipping file.")
                            continue
                    
                    # Ищем файл в распакованном архиве и восстанавливаем его
                    file_restored = self._restore_single_file(
                        db, file_data, temp_dir, db_owner_id
                    )
                    if file_restored:
                        # Обновляем маппинг: ID файла из бэкапа -> ID нового файла в БД
                        # Предполагаем, что файл был создан с ID из бэкапа (если он не существовал в БД)
                        backup_file_id_to_db_file_id[file_data["id"]] = uuid.UUID(file_data["id"])
                        restored_count += 1
                else:
                    # Если файл уже существует, всё равно обновляем маппинг: ID из бэкапа -> ID в текущей БД
                    backup_file_id_to_db_file_id[file_data["id"]] = existing_file.id

            except Exception as e:
                print(
                    f"Warning: Could not restore file {file_data.get('id', 'unknown')}: {str(e)}"
                )
        return restored_count

    def _restore_single_file(
        self, db, file_data: Dict, temp_dir: str, owner_id: uuid.UUID
    ) -> bool:
        """Синхронная версия восстановления одного файла"""
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
        transcoded_uploaded = False # Флаг для транскодированных файлов
        hls_manifest_path_restored = file_data.get("hls_manifest_path") # Изначально предполагаем путь из бэкапа
        dash_manifest_path_restored = file_data.get("dash_manifest_path")

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

        # Проверяем, есть ли папка с транскодированными файлами в распакованном архиве
        hls_source_dir = os.path.join(temp_dir, "transcoded", file_data['id'], "hls")
        if os.path.exists(hls_source_dir):
            try:
                # Определяем базовый путь в S3 для транскодированных файлов (как в transcode_service.py)
                base_s3_path = f"transcoded/{file_data['id']}"
                s3_hls_path = f"{base_s3_path}/hls"

                # Загружаем мастер-плейлист
                master_playlist_local = os.path.join(hls_source_dir, "master.m3u8")
                if os.path.exists(master_playlist_local):
                    s3_key_master = f"{s3_hls_path}/master.m3u8"
                    s3_client.upload_file(master_playlist_local, settings.AWS_S3_BUCKET_NAME, s3_key_master)

                # Загружаем все рендитции
                for item in os.listdir(hls_source_dir):
                    item_path = os.path.join(hls_source_dir, item)
                    if os.path.isdir(item_path) and item.startswith("stream_"):
                        # print(f"Uploading rendition directory {item} to S3") # Для логгирования
                        for filename in os.listdir(item_path):
                            local_file_path = os.path.join(item_path, filename)
                            if os.path.isfile(local_file_path):
                                s3_key = f"{s3_hls_path}/{item}/{filename}"
                                s3_client.upload_file(local_file_path, settings.AWS_S3_BUCKET_NAME, s3_key)

                transcoded_uploaded = True
                # Обновляем путь к манифесту, если он был восстановлен
                # (В принципе, путь должен быть такой же, как в file_data, но перезапишем на всякий случай)
                hls_manifest_path_restored = f"{base_s3_path}/hls/master.m3u8"
                # print(f"Restored HLS manifest path: {hls_manifest_path_restored}") # Для логгирования

            except Exception as e:
                print(f"Warning: Could not restore transcoded files for {file_data.get('id', 'unknown')}: {str(e)}")
                # Не прерываем восстановление основного файла из-за ошибки транскодирования

        # Проверяем, есть ли папка с DASH файлами в распакованном архиве
        dash_source_dir = os.path.join(temp_dir, "transcoded", file_data['id'], "dash")
        if os.path.exists(dash_source_dir):
            try:
                base_s3_path = f"transcoded/{file_data['id']}"
                s3_dash_path = f"{base_s3_path}/dash"

                for filename in os.listdir(dash_source_dir):
                    local_file_path = os.path.join(dash_source_dir, filename)
                    if os.path.isfile(local_file_path):
                        s3_key = f"{s3_dash_path}/{filename}"
                        s3_client.upload_file(local_file_path, settings.AWS_S3_BUCKET_NAME, s3_key)

                transcoded_uploaded = True
                dash_manifest_path_restored = f"{base_s3_path}/dash/manifest.mpd"

            except Exception as e:
                print(f"Warning: Could not restore DASH files for {file_data.get('id', 'unknown')}: {str(e)}")

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
                id=uuid.UUID(file_data["id"]), # Используем ID из бэкапа
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
                hls_manifest_path=hls_manifest_path_restored if transcoded_uploaded else None,
                dash_manifest_path=dash_manifest_path_restored if transcoded_uploaded else None,
                transcoding_status=file_data.get("transcoding_status") or "not_started",
                duration=file_data.get("duration") or None,
                description=file_data.get("description"),
                tags=file_data["tags"], # Оставляем теги как список строк, как они были в бэкапе
                category_id=category_id,
                owner_id=owner_id,  # Используем правильный owner_id (uuid.UUID)
                created_at=file_data["created_at"],
                updated_at=file_data["updated_at"],
            )
            db.add(new_file)
            # db.commit() не вызываем здесь, так как это делается в restore_backup
            return True

        return False

    def _restore_file_group_links(self, db, links_data: List[Dict], backup_file_id_to_db_file_id: Dict[str, uuid.UUID], backup_group_id_to_db_group_id: Dict[str, uuid.UUID]):
        """Восстанавливает связи файлов с коллекциями"""
        for link_data in links_data:
            backup_file_id_str = link_data["file_id"]
            backup_group_id_str = link_data["group_id"]

            # Используем маппинги для получения ID в текущей БД
            db_file_id = backup_file_id_to_db_file_id.get(backup_file_id_str)
            db_group_id = backup_group_id_to_db_group_id.get(backup_group_id_str)

            if not db_file_id or not db_group_id:
                # Если ID не найдены в маппингах, значит файл или группа не были восстановлены
                print(f"Warning: File {backup_file_id_str} or Group {backup_group_id_str} does not exist in backup mapping. Skipping link.")
                continue

            # Проверяем, существуют ли файл и коллекция в БД с этими новыми ID
            file_exists = db.query(DBFile).filter(DBFile.id == db_file_id).first() is not None
            group_exists = db.query(Group).filter(Group.id == db_group_id).first() is not None

            if not file_exists or not group_exists:
                # Если файл или коллекция не существуют, пропускаем связь
                print(f"Warning: File {db_file_id} (from {backup_file_id_str}) or Group {db_group_id} (from {backup_group_id_str}) does not exist in DB. Skipping link.")
                continue

            # Проверяем, существует ли уже такая связь
            existing_link = db.query(file_group).filter(
                file_group.c.file_id == db_file_id,
                file_group.c.group_id == db_group_id
            ).first()

            if not existing_link:
                # Создаём новую связь
                db.execute(file_group.insert().values(file_id=db_file_id, group_id=db_group_id))

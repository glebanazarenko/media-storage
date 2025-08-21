from fastapi import APIRouter, Depends, HTTPException
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
import json
import zipfile
import io
import tempfile
import os
from datetime import datetime, timezone
from typing import List
import uuid
import boto3
from botocore.exceptions import ClientError

from app.core.security import get_current_user
from app.models.base import User, File as DBFile, Tag, Category
from app.core.database import get_db_session
from app.core.config import settings

router = APIRouter(prefix="/backup", tags=["Backup"])

def download_file_from_s3(file_path: str) -> bytes:
    """Скачивает файл из S3 и возвращает его содержимое"""
    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        
        response = s3_client.get_object(
            Bucket=settings.AWS_S3_BUCKET_NAME,
            Key=file_path
        )
        
        return response["Body"].read()
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file from S3: {str(e)}")

@router.get("/download")
def download_backup(
    current_user: User = Depends(get_current_user),
):
    """
    Создает и возвращает бэкап всех файлов пользователя в формате ZIP
    """
    
    try:
        # Получаем все файлы пользователя
        with get_db_session() as db:
            files = db.query(DBFile).filter(DBFile.owner_id == current_user.id).all()
            tags = db.query(Tag).all()
            categories = db.query(Category).all()
            
            # Создаем структуру данных для бэкапа
            backup_data = {
                "user_id": str(current_user.id),
                "username": current_user.username,
                "backup_date": str(datetime.now(timezone.utc)),
                "files": [],
                "tags": [],
                "categories": []
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
                    "created_at": str(file.created_at),
                    "updated_at": str(file.updated_at)
                }
                backup_data["files"].append(file_data)
            
            # Добавляем теги
            for tag in tags:
                tag_data = {
                    "id": str(tag.id),
                    "name": tag.name,
                    "slug": tag.slug,
                    "created_at": str(tag.created_at),
                    "updated_at": str(tag.updated_at)
                }
                backup_data["tags"].append(tag_data)
            
            # Добавляем категории
            for category in categories:
                category_data = {
                    "id": str(category.id),
                    "name": category.name,
                    "slug": category.slug,
                    "description": category.description,
                    "created_at": str(category.created_at)
                }
                backup_data["categories"].append(category_data)
            
            # Создаем ZIP архив
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # Добавляем JSON с метаданными
                json_data = json.dumps(backup_data, indent=2, ensure_ascii=False)
                zip_file.writestr("backup_metadata.json", json_data)
                
                # Добавляем реальные файлы из S3
                for file in files:
                    try:
                        # Добавляем основной файл
                        if file.file_path:
                            file_content = download_file_from_s3(file.file_path)
                            zip_file.writestr(f"files/{file.id}_{file.original_name}", file_content)
                        
                        # Добавляем thumbnail, если есть
                        if file.thumbnail_path:
                            thumbnail_content = download_file_from_s3(file.thumbnail_path)
                            zip_file.writestr(f"thumbnails/{file.id}_thumbnail.jpg", thumbnail_content)
                        
                        # Добавляем preview, если есть
                        if file.preview_path:
                            preview_content = download_file_from_s3(file.preview_path)
                            zip_file.writestr(f"previews/{file.id}_preview.jpg", preview_content)
                            
                    except Exception as e:
                        print(f"Warning: Could not backup file {file.id}: {str(e)}")
                        # Продолжаем с другими файлами даже если один не удался
            
            zip_buffer.seek(0)
            
            filename = f"backup_{current_user.username}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.zip"
            
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup creation failed: {str(e)}")

@router.post("/upload")
async def upload_backup(
    backup_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Восстанавливает данные из бэкап файла
    """
    try:
        # Создаем временную директорию для распаковки
        with tempfile.TemporaryDirectory() as temp_dir:
            # Сохраняем загруженный файл
            file_path = os.path.join(temp_dir, "backup.zip")
            with open(file_path, "wb") as buffer:
                content = await backup_file.read()
                buffer.write(content)
            
            # Распаковываем ZIP архив
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # Читаем метаданные
            metadata_path = os.path.join(temp_dir, "backup_metadata.json")
            if not os.path.exists(metadata_path):
                raise HTTPException(status_code=400, detail="Invalid backup file: metadata not found")
            
            with open(metadata_path, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
            
            restored_files = 0
            
            # Инициализируем S3 клиент
            s3_client = boto3.client(
                "s3",
                endpoint_url=settings.AWS_S3_ENDPOINT_URL,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            )
            
            # Восстанавливаем данные
            with get_db_session() as db:
                # Восстанавливаем категории (если их нет)
                for category_data in backup_data.get("categories", []):
                    existing_category = db.query(Category).filter(
                        Category.name == category_data["name"]
                    ).first()
                    
                    if not existing_category:
                        new_category = Category(
                            id=uuid.UUID(category_data["id"]),
                            name=category_data["name"],
                            slug=category_data["slug"],
                            description=category_data.get("description")
                        )
                        db.add(new_category)
                
                # Восстанавливаем теги (если их нет)
                for tag_data in backup_data.get("tags", []):
                    existing_tag = db.query(Tag).filter(
                        Tag.id == tag_data["id"]
                    ).first()
                    
                    if not existing_tag:
                        new_tag = Tag(
                            id=uuid.UUID(tag_data["id"]),
                            name=tag_data["name"],
                            slug=tag_data["slug"]
                        )
                        db.add(new_tag)
                
                # Восстанавливаем файлы (если их нет)
                for file_data in backup_data.get("files", []):
                    try:
                        # Проверяем, существует ли файл
                        existing_file = db.query(DBFile).filter(
                            DBFile.id == file_data["id"]
                        ).first()
                        
                        if not existing_file:
                            # Ищем файл в распакованном архиве (разные возможные пути)
                            file_content = None
                            thumbnail_content = None
                            preview_content = None
                            
                            # Ищем основной файл
                            possible_file_paths = [
                                os.path.join(temp_dir, "files", f"{file_data['id']}_{file_data['original_name']}"),
                                os.path.join(temp_dir, f"files/{file_data['id']}_{file_data['original_name']}"),
                                os.path.join(temp_dir, file_data['original_name']),
                            ]
                            
                            for path in possible_file_paths:
                                if os.path.exists(path):
                                    with open(path, 'rb') as f:
                                        file_content = f.read()
                                    break
                            
                            # Ищем thumbnail
                            if file_data.get("thumbnail_path"):
                                possible_thumb_paths = [
                                    os.path.join(temp_dir, "thumbnails", f"{file_data['id']}_thumbnail.jpg"),
                                    os.path.join(temp_dir, f"thumbnails/{file_data['id']}_thumbnail.jpg"),
                                ]
                                
                                for path in possible_thumb_paths:
                                    if os.path.exists(path):
                                        with open(path, 'rb') as f:
                                            thumbnail_content = f.read()
                                        break
                            
                            # Ищем preview
                            if file_data.get("preview_path"):
                                possible_preview_paths = [
                                    os.path.join(temp_dir, "previews", f"{file_data['id']}_preview.jpg"),
                                    os.path.join(temp_dir, f"previews/{file_data['id']}_preview.jpg"),
                                ]
                                
                                for path in possible_preview_paths:
                                    if os.path.exists(path):
                                        with open(path, 'rb') as f:
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
                                        Body=file_content
                                    )
                                    file_uploaded = True
                                except Exception as e:
                                    print(f"Failed to upload file to S3: {str(e)}")
                            
                            if thumbnail_content and file_data.get("thumbnail_path"):
                                try:
                                    s3_client.put_object(
                                        Bucket=settings.AWS_S3_BUCKET_NAME,
                                        Key=file_data["thumbnail_path"],
                                        Body=thumbnail_content
                                    )
                                    thumbnail_uploaded = True
                                except Exception as e:
                                    print(f"Failed to upload thumbnail to S3: {str(e)}")
                            
                            if preview_content and file_data.get("preview_path"):
                                try:
                                    s3_client.put_object(
                                        Bucket=settings.AWS_S3_BUCKET_NAME,
                                        Key=file_data["preview_path"],
                                        Body=preview_content
                                    )
                                    preview_uploaded = True
                                except Exception as e:
                                    print(f"Failed to upload preview to S3: {str(e)}")
                            
                            # Создаем запись в БД только если основной файл успешно загружен
                            if file_uploaded:
                                new_file = DBFile(
                                    id=uuid.UUID(file_data["id"]),
                                    original_name=file_data["original_name"],
                                    mime_type=file_data["mime_type"],
                                    file_path=file_data["file_path"],
                                    size=file_data["size"],
                                    thumbnail_path=file_data.get("thumbnail_path") if thumbnail_uploaded else None,
                                    preview_path=file_data.get("preview_path") if preview_uploaded else None,
                                    description=file_data.get("description"),
                                    tags=file_data["tags"],
                                    category_id=uuid.UUID(file_data["category_id"]) if file_data.get("category_id") else None,
                                    owner_id=current_user.id,  # Привязываем к текущему пользователю
                                    created_at=file_data["created_at"],
                                    updated_at=file_data["updated_at"],
                                )
                                db.add(new_file)
                                restored_files += 1
                                
                    except Exception as e:
                        print(f"Warning: Could not restore file {file_data.get('id', 'unknown')}: {str(e)}")
                        # Продолжаем с другими файлами
                
                db.commit()
            
            return {
                "message": "Backup restored successfully",
                "restored_files": restored_files,
                "total_files": len(backup_data.get("files", []))
            }
            
    except Exception as e:
        import traceback
        print(f"Backup restore error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Backup restore failed: {str(e)}")
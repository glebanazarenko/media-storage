import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

# from app.services.file_service import upload_file_to_s3
from app.core.config import settings
# from app.schemas.file import FileCreate, FileResponse
from app.models.base import File as DBFile

router = APIRouter(prefix="/files", tags=["Files"])

# @router.post("/")
# def create_file(
#     file: UploadFile = File(...),
#     description: Optional[str] = None,
#     tags: list[str] = [],
#     db: Session = Depends(get_db)
# ):
#     # Пример генерации ключа для S3
#     key = f"uploads/{uuid.uuid4()}_{file.filename}"

#     # Сохранение файла в S3
#     upload_file_to_s3(file.file, key)

#     db_file = DBFile(
#         original_name=file.filename,
#         mime_type=file.content_type,
#         file_path=key,
#         size=len(file.file._file.read()),
#         thumbnail_path="",  # Можно сгенерировать отдельно
#         preview_path="",    # Для видео
#         description=description,
#         tags=tags
#     )
#     db.add(db_file)
#     db.commit()
#     db.refresh(db_file)
#     return FileResponse.model_validate(db_file)

# @router.get("/{file_id}")
# def get_file(file_id: str, db: Session = Depends(get_db)):
#     file = db.query(DBFile).filter(DBFile.id == file_id).first()
#     if not file:
#         raise HTTPException(status_code=404, detail="File not found")
#     return FileResponse.model_validate(file)

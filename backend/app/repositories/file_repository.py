from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.core.database import get_db_session
from app.models.base import File as DBFile
from app.schemas.file_schemas import FileCreate


def create_file(file_data: FileCreate):
    with get_db_session() as db:
        db_file = DBFile(**file_data.model_dump())
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        return db_file


def get_file_by_id(file_id: str):
    with get_db_session() as db:
        return db.query(DBFile).filter(DBFile.id == file_id).first()


def get_filtered_files(category: str, sort_column: str, order: str, limit: int, offset: int, user_id: str):
    with get_db_session() as db:
        query = db.query(DBFile).filter(DBFile.owner_id == user_id)

        # Пример фильтрации по категории (если есть поле category)
        if category != "all":
            query = query.filter(DBFile.category == category)

        # Сортировка
        sort_attr = getattr(DBFile, sort_column)
        query = query.order_by(desc(sort_attr) if order == "desc" else asc(sort_attr))

        # Пагинация
        files = query.offset(offset).limit(limit).all()
        total = query.count()

        return files, total
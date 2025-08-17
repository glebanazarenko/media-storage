from fastapi import HTTPException
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.models.base import Category
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


def get_filtered_files(
    category: str, sort_column: str, order: str, limit: int, offset: int, user_id: str
):
    with get_db_session() as db:
        # Создаем запрос с JOIN к таблице категорий
        query = (
            db.query(DBFile)
            .join(Category, DBFile.category_id == Category.id)
            .filter(DBFile.owner_id == user_id)
        )

        if category != "all":
            query = query.filter(Category.name == category)

        # Сортировка
        sort_attr = getattr(DBFile, sort_column, None)
        if sort_attr is None:
            # Если сортировка по полю файла не найдена, попробуем по категории
            if sort_column == "category_name":
                sort_attr = Category.name
            else:
                sort_attr = DBFile.created_at  # значение по умолчанию

        query = query.order_by(desc(sort_attr) if order == "desc" else asc(sort_attr))

        # Пагинация
        files = query.offset(offset).limit(limit).all()
        total = query.count()

        return files, total


def get_category_id_by_slug(slug: str) -> str:
    """Получить ID категории по slug"""
    with get_db_session() as db:
        category = db.query(Category).filter(Category.slug == slug).first()
        if not category:
            # Если категория не найдена, используем категорию по умолчанию (0+)
            default_category = (
                db.query(Category).filter(Category.slug == "0-plus").first()
            )
            if default_category:
                return default_category.id
            else:
                raise HTTPException(
                    status_code=500, detail="Default category not found"
                )
        return category.id

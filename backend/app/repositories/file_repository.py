from fastapi import HTTPException
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.models.base import Category
from app.models.base import File as DBFile, Tag
from app.schemas.file_schemas import FileCreate
from uuid import UUID
from typing import List
from sqlalchemy import and_, or_, not_, cast, String
from sqlalchemy.orm import joinedload


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

def get_category_name_by_id(category_id: UUID) -> str:
    with get_db_session() as db:
        category = db.query(Category).filter(Category.id == category_id).first()
        if not category:
            raise HTTPException(
                    status_code=500, detail="Default category not found"
                )
        return category.name


def glob_to_ilike_pattern(mask: str) -> str:
    """
    Преобразует маску (*.mp4, a??.jpg) в шаблон для ILIKE.
    Экранирует %, _, \. '*' -> '%', '?' -> '_'.
    """
    s = mask.replace("\\", "\\\\")
    s = s.replace("%", r"\%").replace("_", r"\_")
    s = s.replace("*", "%").replace("?", "_")
    return s

def split_masks(s: str) -> list[str]:
    """
    Делит строку по запятым и пробелам, убирая пустые элементы.
    Пример: "*.mp4, *a*.jpg  b*" -> ["*.mp4", "*a*.jpg", "b*"]
    """
    if not s:
        return []
    raw = [p.strip() for chunk in s.split(",") for p in chunk.split()]
    return [p for p in raw if p]

# --- UPDATED: search_files (только блок поиска по тексту заменён) ---
def search_files(
    query: str = None,
    category: str | None = None,
    include_tags: List[str] = None,
    exclude_tags: List[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    limit: int = 20,
    user_id: str = None,
) -> tuple[List[DBFile], int]:
    """
    Поиск файлов с фильтрами.
    Поддерживает поиск по original_name, description, tag.name,
    и поиск по маскам (*.mp4, *a*.jpg, b* и т.д.) в original_name.
    """
    with get_db_session() as db:
        query_obj = (
            db.query(DBFile)
            .options(joinedload(DBFile.category))
            .join(Category, DBFile.category_id == Category.id)
            .filter(DBFile.owner_id == user_id)
        )

        if query:
            has_glob = ("*" in query) or ("?" in query)
            if has_glob:
                masks = split_masks(query)
                if masks:
                    like_clauses = [
                        DBFile.original_name.ilike(glob_to_ilike_pattern(m), escape="\\")
                        for m in masks
                    ]
                    query_obj = query_obj.filter(and_(*like_clauses))
            else:
                text_filter = or_(
                    DBFile.original_name.ilike(f"%{query}%"),
                    DBFile.description.ilike(f"%{query}%"),
                )
                query_obj = query_obj.filter(text_filter)

        if category != "all":
            query_obj = query_obj.filter(Category.name == category)

        if include_tags:
            tag_objects = db.query(Tag).filter(Tag.name.in_(include_tags)).all()
            tag_ids = [str(tag.id) for tag in tag_objects]
            if tag_ids:
                include_conditions = [DBFile.tags.contains([tag_id]) for tag_id in tag_ids]
                query_obj = query_obj.filter(and_(*include_conditions))

        if exclude_tags:
            exclude_tag_objects = db.query(Tag).filter(Tag.name.in_(exclude_tags)).all()
            exclude_tag_ids = [str(tag.id) for tag in exclude_tag_objects]
            if exclude_tag_ids:
                exclude_conditions = [not_(DBFile.tags.contains([tag_id])) for tag_id in exclude_tag_ids]
                query_obj = query_obj.filter(and_(*exclude_conditions))

        sort_attr = getattr(DBFile, sort_by, DBFile.created_at)
        order_func = desc if sort_order == "desc" else asc
        query_obj = query_obj.order_by(order_func(sort_attr))

        offset = (page - 1) * limit
        files = query_obj.offset(offset).limit(limit).all()
        total = query_obj.count()

        return files, total

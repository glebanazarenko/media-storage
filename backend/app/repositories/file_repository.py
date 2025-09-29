from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, asc, desc, not_, or_, distinct
from sqlalchemy.orm import joinedload, selectinload

from app.core.database import get_db_session
from app.models.base import Category
from app.models.base import File as DBFile
from app.models.base import Tag
from app.models.base import file_group # Таблица связи файлов и групп
from app.models.base import Group, GroupMember
from app.repositories.tag_repository import get_or_create_tags
from app.schemas.file_schemas import FileCreate


def create_file(file_data: FileCreate) -> DBFile:
    with get_db_session() as db:
        db_file = DBFile(**file_data.model_dump())
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        return db_file


def get_file_by_id(file_id: str) -> DBFile | None:
    with get_db_session() as db:
        # Загружаем файл и его теги, категории, и группы
        # tags - это JSONB столбец, его не нужно отдельно загружать через relationship
        file = (
            db.query(DBFile)
            .options(joinedload(DBFile.category)) # Загружаем категорию
            # .options(selectinload(DBFile.tags_rel)) # УДАЛЕНО: tags_rel не существует
            .options(selectinload(DBFile.groups))  # Загружаем группы
            .filter(DBFile.id == file_id)
            .first()
        )
        return file


def delete_file_from_db(file_id: str) -> None:
    """Удаление файла из базы данных"""
    with get_db_session() as db:
        db_file = db.query(DBFile).filter(DBFile.id == file_id).first()
        if db_file:
            db.delete(db_file)
            db.commit()


def get_filtered_files(
    category: str, sort_column: str, order: str, limit: int, offset: int, user_id: str
) -> tuple[list[DBFile], int]:
    with get_db_session() as db:
        # Создаем запрос с JOIN к таблице категорий и фильтрацией по владельцу ИЛИ по группам
        query = (
            db.query(distinct(DBFile.id), DBFile) # distinct для избежания дубликатов
            .join(Category, DBFile.category_id == Category.id)
            .outerjoin(file_group, DBFile.id == file_group.c.file_id) # LEFT JOIN к связи файл-группа
            .outerjoin(GroupMember, and_(file_group.c.group_id == GroupMember.group_id, GroupMember.user_id == user_id)) # LEFT JOIN к членству
            .filter(
                or_(
                    DBFile.owner_id == user_id, # Файл принадлежит пользователю
                    GroupMember.user_id == user_id # Или файл принадлежит группе, в которой состоит пользователь
                )
            )
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
        results = query.offset(offset).limit(limit).all()
        # Извлекаем объекты файлов из результата
        files = [r[1] for r in results]
        # Для подсчета общего количества нужно выполнить тот же запрос без LIMIT и OFFSET, но с COUNT
        count_query = (
            db.query(distinct(DBFile.id))
            .join(Category, DBFile.category_id == Category.id)
            .outerjoin(file_group, DBFile.id == file_group.c.file_id)
            .outerjoin(GroupMember, and_(file_group.c.group_id == GroupMember.group_id, GroupMember.user_id == user_id))
            .filter(
                or_(
                    DBFile.owner_id == user_id,
                    GroupMember.user_id == user_id
                )
            )
        )
        if category != "all":
            count_query = count_query.filter(Category.name == category)
        total = count_query.count()

        return files, total


def get_category_id_by_slug(slug: str) -> UUID:
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
            raise HTTPException(status_code=500, detail="Default category not found")
        return category.name


def glob_to_ilike_pattern(mask: str) -> str:
    """
    Преобразует маску (*.mp4, a??.jpg) в шаблон для ILIKE.
    Экранирует %, _, \\. '*' -> '%', '?' -> '_'.
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


def search_files(
    query_str: str = None, # Переименовал, чтобы не пересекалось с sqlalchemy.orm.query
    category: str | None = None,
    include_tags: list[str] = None,
    exclude_tags: list[str] = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    limit: int = 20,
    user_id: str = None,
) -> tuple[list[DBFile], int]:
    """
    Поиск файлов с фильтрами и доступом через группы.
    """
    with get_db_session() as db:
        query_obj = (
            db.query(distinct(DBFile.id), DBFile) # distinct для избежания дубликатов
            .join(Category, DBFile.category_id == Category.id)
            .outerjoin(file_group, DBFile.id == file_group.c.file_id)
            .outerjoin(GroupMember, and_(file_group.c.group_id == GroupMember.group_id, GroupMember.user_id == user_id))
            .filter(
                or_(
                    DBFile.owner_id == user_id,
                    GroupMember.user_id == user_id
                )
            )
        )

        if query_str:
            has_glob = ("*" in query_str) or ("?" in query_str)
            if has_glob:
                masks = split_masks(query_str)
                if masks:
                    like_clauses = [
                        DBFile.original_name.ilike(
                            glob_to_ilike_pattern(m), escape="\\"
                        )
                        for m in masks
                    ]
                    query_obj = query_obj.filter(and_(*like_clauses))
            else:
                text_filter = or_(
                    DBFile.original_name.ilike(f"%{query_str}%"),
                    DBFile.description.ilike(f"%{query_str}%"),
                )
                query_obj = query_obj.filter(text_filter)

        if category != "all":
            query_obj = query_obj.filter(Category.name == category)

        if include_tags:
            tag_objects = db.query(Tag).filter(Tag.name.in_(include_tags)).all()
            tag_ids = [str(tag.id) for tag in tag_objects]
            if tag_ids:
                include_conditions = [
                    DBFile.tags.contains([tag_id]) for tag_id in tag_ids
                ]
                query_obj = query_obj.filter(and_(*include_conditions))

        if exclude_tags:
            exclude_tag_objects = db.query(Tag).filter(Tag.name.in_(exclude_tags)).all()
            exclude_tag_ids = [str(tag.id) for tag in exclude_tag_objects]
            if exclude_tag_ids:
                exclude_conditions = [
                    not_(DBFile.tags.contains([tag_id])) for tag_id in exclude_tag_ids
                ]
                query_obj = query_obj.filter(and_(*exclude_conditions))

        if min_duration is not None:
            query_obj = query_obj.filter(DBFile.duration >= min_duration)
        if max_duration is not None:
            query_obj = query_obj.filter(DBFile.duration <= max_duration)

        sort_attr = getattr(DBFile, sort_by, DBFile.created_at)
        order_func = desc if sort_order == "desc" else asc
        query_obj = query_obj.order_by(order_func(sort_attr))

        offset = (page - 1) * limit
        results = query_obj.offset(offset).limit(limit).all()
        files = [r[1] for r in results] # Извлекаем объекты файлов

        # Подсчет общего количества
        count_query = (
            db.query(distinct(DBFile.id))
            .join(Category, DBFile.category_id == Category.id)
            .outerjoin(file_group, DBFile.id == file_group.c.file_id)
            .outerjoin(GroupMember, and_(file_group.c.group_id == GroupMember.group_id, GroupMember.user_id == user_id))
            .filter(
                or_(
                    DBFile.owner_id == user_id,
                    GroupMember.user_id == user_id
                )
            )
        )
        if query_str:
            if has_glob:
                 masks = split_masks(query_str)
                 if masks:
                    like_clauses = [
                        DBFile.original_name.ilike(
                            glob_to_ilike_pattern(m), escape="\\"
                        )
                        for m in masks
                    ]
                    count_query = count_query.filter(and_(*like_clauses))
            else:
                text_filter = or_(
                    DBFile.original_name.ilike(f"%{query_str}%"),
                    DBFile.description.ilike(f"%{query_str}%"),
                )
                count_query = count_query.filter(text_filter)

        if category != "all":
            count_query = count_query.filter(Category.name == category)

        if include_tags:
            tag_objects = db.query(Tag).filter(Tag.name.in_(include_tags)).all()
            tag_ids = [str(tag.id) for tag in tag_objects]
            if tag_ids:
                include_conditions = [
                    DBFile.tags.contains([tag_id]) for tag_id in tag_ids
                ]
                count_query = count_query.filter(and_(*include_conditions))

        if exclude_tags:
            exclude_tag_objects = db.query(Tag).filter(Tag.name.in_(exclude_tags)).all()
            exclude_tag_ids = [str(tag.id) for tag in exclude_tag_objects]
            if exclude_tag_ids:
                exclude_conditions = [
                    not_(DBFile.tags.contains([tag_id])) for tag_id in exclude_tag_ids
                ]
                count_query = count_query.filter(and_(*exclude_conditions))

        if min_duration is not None:
            count_query = count_query.filter(DBFile.duration >= min_duration)
        if max_duration is not None:
            count_query = count_query.filter(DBFile.duration <= max_duration)

        total = count_query.count()

        return files, total


def update_file(
    file_id: str,
    description: str | None,
    tag_names: str,
    category: str,
    user_id: str,
) -> DBFile:
    with get_db_session() as db:
        # Получаем файл
        db_file = (
            db.query(DBFile)
            .filter(DBFile.id == file_id, DBFile.owner_id == user_id)
            .first()
        )
        if not db_file:
            raise Exception("File not found or access denied")

        # Обновляем описание
        if description is not None:
            db_file.description = description

        # Обновляем категорию
        category_mapping = {"0+": "0-plus", "16+": "16-plus", "18+": "18-plus"}
        db_file.category_id = get_category_id_by_slug(
            category_mapping.get(category, "0-plus")
        )

        # Обновляем теги
        if tag_names:
            tag_name_list = [
                name.strip() for name in tag_names.split(",") if name.strip()
            ]
            tag_name_list = list(set(tag_name_list))
            db_file.tags = get_or_create_tags(tag_name_list)

        db_file.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_file)
        return db_file

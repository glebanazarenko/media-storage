from datetime import datetime, timezone
from uuid import UUID
import re

from fastapi import HTTPException
from sqlalchemy import and_, asc, desc, not_, or_, distinct
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import func

from app.core.database import get_db_session
from app.models.base import Category
from app.models.base import File as DBFile
from app.models.base import Tag
from app.models.base import file_group # Таблица связи файлов и групп
from app.models.base import Group, GroupMember
from app.repositories.tag_repository import get_or_create_tags
from app.schemas.file_schemas import FileCreate

REGEX_CHARS = {'^', '$', '(', ')', '|', '{', '}', '[', ']', '\\'}


def create_file(file_data: FileCreate) -> DBFile:
    with get_db_session() as db:
        file_data_dict = file_data.model_dump()
        group_id = file_data_dict.pop('group_id', None) # Извлекаем group_id

        db_file = DBFile(**file_data_dict)
        db.add(db_file)
        db.flush() # flush, чтобы получить id файла до commit

        # Если указана группа, добавляем связь
        if group_id:
            # Проверим, существует ли группа (опционально, но желательно)
            group_exists = db.query(Group.id).filter(Group.id == group_id).first() is not None
            if not group_exists:
                db.rollback()
                raise HTTPException(status_code=404, detail="Group not found")
            # Добавляем запись в промежуточную таблицу
            association = file_group.insert().values(file_id=db_file.id, group_id=group_id)
            db.execute(association)

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

def is_regex(query: str) -> bool:
    """
    Определяет, является ли строка регулярным выражением, по характерным символам.
    """
    if not query:
        return False

    # Если строка содержит один из специфичных символов регулярного выражения
    if any(c in query for c in REGEX_CHARS):
        # Но не содержит * или ?, значит, это не glob
        if not ('*' in query or '?' in query):
            return True
        # Или если содержит *, ?, но в контексте, который похож на регулярку
        # Например, "(txt|pdf)$" или "^(?!.*\.png$).*"
        # Можно добавить проверку на паттерны
        if re.search(r'[()|\[\]{}^$\\]', query):
            return True

    return False


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
    query_str: str = None,
    category: str | None = None,
    include_tags: list[str] = None,
    exclude_tags: list[str] = None,
    include_groups: list[str] = None,
    exclude_groups: list[str] = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    page: int = 1,
    limit: int = 20,
    user_id: str = None,
    randomize: bool = False, # Новый параметр
) -> tuple[list[DBFile], int]:
    """
    Поиск файлов с фильтрами, доступом через группы и опциональной рандомизацией.
    """
    with get_db_session() as db:
        # --- Основной запрос для фильтрации и получения ID файлов ---
        # Этот запрос будет использоваться как основа для фильтрации и подсчёта
        base_query = (
            db.query(DBFile.id)
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

        # --- Фильтрация по группам ---
        if include_groups:
            group_ids_to_include = db.query(Group.id).filter(Group.name.in_(include_groups)).all()
            group_ids_to_include = [g[0] for g in group_ids_to_include]
            if group_ids_to_include:
                base_query = base_query.filter(file_group.c.group_id.in_(group_ids_to_include))
            else:
                base_query = base_query.filter(False)

        if exclude_groups:
            group_ids_to_exclude = db.query(Group.id).filter(Group.name.in_(exclude_groups)).all()
            group_ids_to_exclude = [g[0] for g in group_ids_to_exclude]
            if group_ids_to_exclude:
                excluded_files_subq = (
                    db.query(DBFile.id)
                    .join(file_group, DBFile.id == file_group.c.file_id)
                    .filter(file_group.c.group_id.in_(group_ids_to_exclude))
                    .subquery()
                )
                base_query = base_query.filter(not_(DBFile.id.in_(db.query(excluded_files_subq.c.id))))

        # --- Остальные фильтры (query, category, tags, duration) ---
        if query_str:
            if is_regex(query_str):
                regex_filter = DBFile.original_name.op("~*")(query_str)
                base_query = base_query.filter(regex_filter)
            else:
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
                        base_query = base_query.filter(or_(*like_clauses))
                else:
                    text_filter = or_(
                        DBFile.original_name.ilike(f"%{query_str}%"),
                        DBFile.description.ilike(f"%{query_str}%"),
                    )
                    base_query = base_query.filter(text_filter)

        if category != "all":
            base_query = base_query.filter(Category.name == category)

        if include_tags:
            tag_objects = db.query(Tag).filter(Tag.name.in_(include_tags)).all()
            tag_ids = [str(tag.id) for tag in tag_objects]
            if tag_ids:
                include_conditions = [
                    DBFile.tags.contains([tag_id]) for tag_id in tag_ids
                ]
                base_query = base_query.filter(and_(*include_conditions))

        if exclude_tags:
            exclude_tag_objects = db.query(Tag).filter(Tag.name.in_(exclude_tags)).all()
            exclude_tag_ids = [str(tag.id) for tag in exclude_tag_objects]
            if exclude_tag_ids:
                exclude_conditions = [
                    not_(DBFile.tags.contains([tag_id])) for tag_id in exclude_tag_ids
                ]
                base_query = base_query.filter(and_(*exclude_conditions))

        if min_duration is not None:
            base_query = base_query.filter(DBFile.duration >= min_duration)
        if max_duration is not None:
            base_query = base_query.filter(DBFile.duration <= max_duration)

        # --- Подсчёт общего количества (из базового запроса) ---
        total = base_query.count()

        # --- Рандомизация или обычная сортировка для выборки ID ---
        if randomize:
            # Используем func.random() для PostgreSQL, сортируем ID
            # DISTINCT не нужен, так как id уникальны
            sorted_ids_query = base_query.order_by(func.random())
        else:
            sort_attr = getattr(DBFile, sort_by, DBFile.created_at)
            order_func = desc if sort_order == "desc" else asc
            sorted_ids_query = base_query.order_by(order_func(sort_attr))

        # --- Пагинация для ID ---
        offset = (page - 1) * limit
        selected_ids = sorted_ids_query.offset(offset).limit(limit).all()
        selected_ids = [row[0] for row in selected_ids] # Извлекаем список UUID

        if not selected_ids:
            # Если по каким-то причинам ID не найдены, возвращаем пустой список и 0
            return [], total

        # --- Запрос для получения полных объектов файлов по выбранным ID ---
        # Используем 'in_' для фильтрации по списку ID и снова JOIN'ы для связанных данных
        # distinct(DBFile.id) нужен, если JOIN'ы могут привести к дубликатам (например, через теги или группы),
        # но т.к. мы фильтруем по конкретному списку ID, дубликатов быть не должно.
        # Однако, если файлы могут быть связаны с несколькими группами/тегами, которые учитываются в фильтрах,
        # то JOIN может создать дубликаты. В этом случае distinct всё равно нужен.
        # В целях безопасности и соответствия логике, оставим distinct.
        files_query = (
            db.query(distinct(DBFile.id), DBFile)
            .join(Category, DBFile.category_id == Category.id)
            .outerjoin(file_group, DBFile.id == file_group.c.file_id)
            .outerjoin(GroupMember, and_(file_group.c.group_id == GroupMember.group_id, GroupMember.user_id == user_id))
            .filter(
                or_(
                    DBFile.owner_id == user_id,
                    GroupMember.user_id == user_id
                )
            )
            .filter(DBFile.id.in_(selected_ids))
            # Для сохранения порядка, заданного в selected_ids, можно использовать case/when
            # или сортировать по индексу в списке selected_ids.
            # Это сложнее, но гарантирует порядок.
            # Простой способ в SQLAlchemy - использовать order_by с case, но он громоздкий.
            # Альтернатива - загрузить файлы и отсортировать их в Python.
            # Используем Python сортировку.
        )

        # Применяем те же фильтры, что и в base_query, чтобы убедиться, что загруженные файлы подходят
        # (хотя они уже отфильтрованы по ID, которые прошли через base_query)
        # Повтор фильтров из base_query:
        if include_groups:
            group_ids_to_include = db.query(Group.id).filter(Group.name.in_(include_groups)).all()
            group_ids_to_include = [g[0] for g in group_ids_to_include]
            if group_ids_to_include:
                files_query = files_query.filter(file_group.c.group_id.in_(group_ids_to_include))
            else:
                files_query = files_query.filter(False) # Не должно сработать, если ID были отфильтрованы

        if exclude_groups:
            # Не нужно повторять логику исключения для загрузки, т.к. ID уже прошли через неё
            # Однако, если файлы могут быть связаны с разными группами в одном запросе,
            # и одна группа исключает, а другая нет, но файл всё равно включён по ID,
            # то он может попасть сюда. Поэтому фильтр exclude нужен и тут.
            # Логика исключения: файл НЕ должен быть в НИ ОДНОЙ из исключаемых групп.
            # Это сложнее выразить через JOIN. Лучше использовать подзапрос, как в base_query.
            if exclude_groups: # Проверяем снова, так как это может быть пустым списком
                group_ids_to_exclude = db.query(Group.id).filter(Group.name.in_(exclude_groups)).all()
                group_ids_to_exclude = [g[0] for g in group_ids_to_exclude]
                if group_ids_to_exclude:
                    excluded_files_subq = (
                        db.query(DBFile.id)
                        .join(file_group, DBFile.id == file_group.c.file_id)
                        .filter(file_group.c.group_id.in_(group_ids_to_exclude))
                        .subquery()
                    )
                    files_query = files_query.filter(not_(DBFile.id.in_(db.query(excluded_files_subq.c.id))))

        if query_str:
            if is_regex(query_str):
                regex_filter = DBFile.original_name.op("~*")(query_str)
                files_query = files_query.filter(regex_filter)
            else:
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
                        files_query = files_query.filter(or_(*like_clauses))
                else:
                    text_filter = or_(
                        DBFile.original_name.ilike(f"%{query_str}%"),
                        DBFile.description.ilike(f"%{query_str}%"),
                    )
                    files_query = files_query.filter(text_filter)

        if category != "all":
            files_query = files_query.filter(Category.name == category)

        if include_tags:
            tag_objects = db.query(Tag).filter(Tag.name.in_(include_tags)).all()
            tag_ids = [str(tag.id) for tag in tag_objects]
            if tag_ids:
                include_conditions = [
                    DBFile.tags.contains([tag_id]) for tag_id in tag_ids
                ]
                files_query = files_query.filter(and_(*include_conditions))

        if exclude_tags:
            exclude_tag_objects = db.query(Tag).filter(Tag.name.in_(exclude_tags)).all()
            exclude_tag_ids = [str(tag.id) for tag in exclude_tag_objects]
            if exclude_tag_ids:
                exclude_conditions = [
                    not_(DBFile.tags.contains([tag_id])) for tag_id in exclude_tag_ids
                ]
                files_query = files_query.filter(and_(*exclude_conditions))

        if min_duration is not None:
            files_query = files_query.filter(DBFile.duration >= min_duration)
        if max_duration is not None:
            files_query = files_query.filter(DBFile.duration <= max_duration)

        # Выполняем запрос для получения файлов
        results = files_query.all()
        files = [r[1] for r in results] # Извлекаем объекты DBFile

        # --- Сортировка результатов в Python для сохранения порядка из selected_ids ---
        # Создаём словарь id -> индекс в selected_ids для быстрой сортировки
        id_order_map = {file_id: idx for idx, file_id in enumerate(selected_ids)}
        # Сортируем файлы по порядку, в котором они были в selected_ids
        files.sort(key=lambda f: id_order_map.get(f.id, len(selected_ids))) # Если id не найден, ставим в конец

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
            .filter(DBFile.id == file_id)
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

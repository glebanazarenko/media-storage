import re
from typing import List
from uuid import UUID

from sqlalchemy import and_

from app.core.database import get_db_session
from app.models.base import File, Tag


def slugify(text: str) -> str:
    """Простая функция для создания slug из текста."""
    # Приводим к нижнему регистру
    text = text.lower()
    # Заменяем пробелы и специальные символы на дефисы
    text = re.sub(
        r"[^\w\s-]", "", text
    )  # Убираем всё, кроме букв, цифр, пробелов и дефисов
    text = re.sub(
        r"[-\s]+", "-", text
    )  # Заменяем последовательности дефисов/пробелов на один дефис
    # Убираем начальные и конечные дефисы
    text = text.strip("-")
    return (
        text or "untitled-tag"
    )  # На случай, если текст был пустым или состоял только из спецсимволов


def get_or_create_tags(tag_names: List[str]) -> List[UUID]:
    """
    Получает или создаёт теги по списку их имён.
    Возвращает список UUID созданных или найденных тегов.
    """
    tag_id_strings = []
    # Получаем все потенциальные slug'и для поиска
    slugs_to_find = [slugify(name) for name in tag_names]

    with get_db_session() as db:
        # Запрашиваем все теги, slug которых есть в нашем списке
        existing_tags = db.query(Tag).filter(Tag.slug.in_(slugs_to_find)).all()
        existing_slugs = {tag.slug: tag for tag in existing_tags}

        for name in tag_names:
            slug = slugify(name)
            # Проверяем, существует ли тег с таким slug
            if slug in existing_slugs:
                tag_id_strings.append(str(existing_slugs[slug].id))
            else:
                # Если не существует, создаём новый
                new_tag = Tag(
                    name=name.strip().lower(), slug=slug
                )  # .strip() убирает пробелы по краям
                db.add(new_tag)
                db.flush()  # Получаем ID до коммита
                tag_id_strings.append(str(new_tag.id))
                # Добавляем в словарь, чтобы избежать дубликатов в рамках одного запроса
                existing_slugs[slug] = new_tag

        db.commit()  # Коммитим все изменения
        return tag_id_strings


def get_tag_names_by_ids(tag_ids: List[UUID]) -> List[str]:
    with get_db_session() as db:
        tags_names = []
        for tag_id in tag_ids:
            tags_name = db.query(Tag).filter(Tag.id == tag_id).first().name
            tags_names.append(tags_name)
        return tags_names


def search_tags(query: str, limit: int, user_id: UUID) -> List[Tag]:
    """
    Search for tags that are used in files owned by the specified user or files in collections (groups) where the user has access.
    """
    with get_db_session() as db:
        # Get all files owned by the user
        owned_files = db.query(File).filter(File.owner_id == user_id).all()

        # Get all files from groups where the user is a member
        user_groups_files = (
            db.query(File)
            .join(file_group)
            .join(GroupMember)
            .filter(GroupMember.user_id == user_id)
            .all()
        )

        # Combine both lists of files
        all_accessible_files = owned_files + user_groups_files

        # Collect all unique tag IDs from all accessible files
        all_tag_ids = set()
        for file in all_accessible_files:
            if file.tags:
                all_tag_ids.update(file.tags)

        if not all_tag_ids:
            return []

        # Search for tags by collected IDs and name
        query_obj = (
            db.query(Tag)
            .filter(and_(Tag.id.in_(all_tag_ids), Tag.name.ilike(f"%{query}%")))
            .order_by(Tag.name)
            .limit(limit)
        )

        return query_obj.all()
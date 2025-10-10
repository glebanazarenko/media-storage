from typing import List, Optional
from sqlalchemy import and_, desc, asc
from app.core.database import get_db_session
from app.models.base import Group, GroupMember, File, User
from app.models.base import file_group # Таблица связи файлов и групп
from sqlalchemy.orm import joinedload 
from sqlalchemy import and_, asc, desc, not_, or_, distinct
from sqlalchemy.orm import joinedload, selectinload
import uuid

def create_group_db(group: Group) -> Group:
    with get_db_session() as db:
        db.add(group)
        db.commit()
        db.refresh(group)
        return group

def get_user_groups_db(user_id: str) -> List[Group]:
    with get_db_session() as db:
        # Получаем группы, в которых пользователь является участником
        groups = (
            db.query(Group)
            .join(GroupMember, Group.id == GroupMember.group_id)
            .filter(GroupMember.user_id == user_id)
            .all()
        )
        return groups

def get_group_by_id_db(group_id: str) -> Optional[Group]:
    with get_db_session() as db:
        return db.query(Group).filter(Group.id == group_id).first()

def update_group_db(group_id: str, update_data: dict) -> Group:
    with get_db_session() as db:
        group = db.query(Group).filter(Group.id == group_id).first()
        if group:
            for key, value in update_data.items():
                setattr(group, key, value)
            db.commit()
            db.refresh(group)
        return group

def delete_group_db(group_id: str):
    with get_db_session() as db:
        group = db.query(Group).filter(Group.id == group_id).first()
        if group:
            # Удаляем связи файлов с группой
            db.query(file_group).filter(file_group.c.group_id == group_id).delete()
            # Удаляем участников группы
            db.query(GroupMember).filter(GroupMember.group_id == group_id).delete()
            # Удаляем саму группу
            db.delete(group)
            db.commit()

def add_member_to_group_db(member: GroupMember) -> GroupMember:
    with get_db_session() as db:
        db.add(member)
        db.commit()
        db.refresh(member)
        return member

def remove_member_from_group_db(group_id: str, user_id: str):
    with get_db_session() as db:
        member = (
            db.query(GroupMember)
            .filter(and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
            .first()
        )
        if member:
            db.delete(member)
            db.commit()

def update_member_role_db(group_id: str, user_id: str, new_role: str) -> GroupMember:
    with get_db_session() as db:
        member = (
            db.query(GroupMember)
            .filter(and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
            .first()
        )
        if member:
            member.role = new_role
            db.commit()
            db.refresh(member)
        return member

def get_group_files_db(group_id: str, sort_column: str, order: str, limit: int, offset: int) -> tuple[List[File], int]:
    with get_db_session() as db:
        query = (
            db.query(File)
            .join(file_group, File.id == file_group.c.file_id)
            .filter(file_group.c.group_id == group_id)
        )
        # Сортировка
        sort_attr = getattr(File, sort_column, None)
        if sort_attr is None:
            sort_attr = File.created_at  # значение по умолчанию
        query = query.order_by(desc(sort_attr) if order == "desc" else asc(sort_attr))

        files = query.offset(offset).limit(limit).all()
        total = query.count()
        return files, total

def add_file_to_group_db(group_id: str, file_id: str):
    with get_db_session() as db:
        # Проверяем, что связи нет
        existing = db.query(file_group).filter(
            and_(file_group.c.group_id == group_id, file_group.c.file_id == file_id)
        ).first()
        if not existing:
            # Создаем новую связь
            db.execute(file_group.insert().values(group_id=group_id, file_id=file_id))
            db.commit()

def remove_file_from_group_db(group_id: str, file_id: str):
    with get_db_session() as db:
        # Удаляем связь
        db.execute(file_group.delete().where(
            and_(file_group.c.group_id == group_id, file_group.c.file_id == file_id)
        ))
        db.commit()

def get_user_role_in_group_db(group_id: str, user_id: str) -> Optional[str]:
    """Получает роль пользователя в группе."""
    with get_db_session() as db:
        member = (
            db.query(GroupMember.role)
            .filter(and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
            .first()
        )
        return member.role if member else None

def get_file_by_id_db(file_id: str) -> Optional[File]:
     # Импортируем из основного репозитория файлов, чтобы избежать дублирования
     from app.repositories.file_repository import get_file_by_id
     return get_file_by_id(file_id)

def get_user_by_id_db(user_id: str) -> Optional[User]:
    """Получает пользователя по ID."""
    with get_db_session() as db:
        return db.query(User).filter(User.id == user_id).first()

def get_group_members_db(group_id: str) -> List[GroupMember]:
    with get_db_session() as db:
        members = (
            db.query(GroupMember)
            .options(joinedload(GroupMember.user)) # <-- Загружаем связанного пользователя
            .filter(GroupMember.group_id == group_id)
            .all()
        )
        return members

def get_group_id_by_file_id(file_id: str, user_id: str) -> str:
    """
    Находит ID группы, к которой принадлежит файл и в которой состоит пользователь.

    Args:
        file_id: ID файла.
        user_id: ID пользователя.

    Returns:
        ID группы, если файл принадлежит хотя бы одной группе, в которой состоит пользователь.
        None, если файл не принадлежит ни одной группе или пользователь не состоит ни в одной группе, содержащей файл.

    Raises:
        ValueError: Если file_id или user_id недействительны.
        Exception: Для любых других внутренних ошибок.
    """
    with get_db_session() as db:
        try:
            # Выполняем JOIN между таблицами file_group, GroupMember, и groups
            # для поиска групп, где файл связан с группой и пользователь состоит в этой группе.
            # distinct() используется, чтобы избежать дубликатов, если бы файл был
            # связан с одной группой несколько раз (хотя уникальный индекс этого не позволит).
            result = (
                db.query(distinct(file_group.c.group_id))
                .join(
                    GroupMember,
                    and_(
                        file_group.c.group_id == GroupMember.group_id,
                        GroupMember.user_id == user_id # Фильтр по пользователю
                    )
                )
                .filter(file_group.c.file_id == file_id) # Фильтр по файлу
                .first()
            )

            if result:
                # result - это кортеж, например, (UUID('...'),)
                # Возвращаем первый элемент кортежа (ID группы) как строку
                return str(result[0])
            else:
                # Возвращаем None, если связь не найдена
                return None

        except Exception as e:
            print(f"Database error in get_group_id_by_file_id: {e}")
            raise e
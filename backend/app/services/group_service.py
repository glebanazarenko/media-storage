from typing import List
from fastapi import HTTPException
from app.models.base import Group, GroupMember, User, File
from app.repositories.group_repository import (
    create_group_db,
    get_user_groups_db,
    get_group_by_id_db,
    update_group_db,
    delete_group_db,
    add_member_to_group_db,
    remove_member_from_group_db,
    update_member_role_db,
    get_group_files_db,
    add_file_to_group_db,
    remove_file_from_group_db,
    get_user_role_in_group_db,
    get_file_by_id_db,
    get_user_by_id_db,
    get_group_members_db,
)
from app.models.base import User as DBUser # Используем алиас для ясности
from app.schemas.group_schemas import GroupMemberListResponse, GroupMemberUserResponse

def _check_user_can_edit_group(group: Group, user: User) -> bool:
    """Проверяет, может ли пользователь редактировать группу (админ или создатель)."""
    member_role = get_user_role_in_group_db(group.id, user.id)
    return member_role in ["admin"] or group.creator_id == user.id

def _check_user_can_read_group(group: Group, user: User) -> bool:
    """Проверяет, может ли пользователь читать группу (любая роль или создатель)."""
    member_role = get_user_role_in_group_db(group.id, user.id)
    return member_role in ["reader", "editor", "admin"] or group.creator_id == user.id

def _check_user_can_edit_file_in_group(file: File, user: User) -> bool:
    """Проверяет, может ли пользователь редактировать файл в контексте групп."""
    # Проверяем, является ли пользователь владельцем файла
    if file.owner_id == user.id:
        return True
    # Проверяем, принадлежит ли файл хотя бы одной группе, в которой пользователь редактор или админ
    for group in file.groups:
        role_in_group = get_user_role_in_group_db(group.id, user.id)
        if role_in_group in ["editor", "admin"]:
            return True
    return False

def _check_user_can_read_file(file: File, user: User) -> bool:
    """Проверяет, может ли пользователь читать файл (владелец или группа с доступом)."""
    # Проверяем, является ли пользователь владельцем файла
    if file.owner_id == user.id:
        return True
    # Проверяем, принадлежит ли файл хотя бы одной группе, в которой пользователь имеет доступ
    for group in file.groups:
        role_in_group = get_user_role_in_group_db(group.id, user.id)
        if role_in_group in ["reader", "editor", "admin"]:
            return True
    return False

def create_group_service(group_data: 'GroupCreate', user: User) -> 'GroupResponse':
    group = Group(
        name=group_data.name,
        description=group_data.description,
        creator_id=user.id,
        access_level="admin" # Создатель сразу получает уровень админа
    )
    created_group = create_group_db(group)
    # Автоматически добавляем создателя как администратора
    member = GroupMember(
        user_id=user.id,
        group_id=created_group.id,
        role="admin"
    )
    add_member_to_group_db(member)
    from app.schemas.group_schemas import GroupResponse
    return GroupResponse.model_validate(created_group)

def get_user_groups_service(user: User) -> List['GroupResponse']:
    groups = get_user_groups_db(user.id)
    from app.schemas.group_schemas import GroupResponse
    return [GroupResponse.model_validate(g) for g in groups]

def get_group_by_id_service(group_id: str, user: User) -> 'GroupResponse':
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_read_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to group")
    from app.schemas.group_schemas import GroupResponse
    return GroupResponse.model_validate(group)

def update_group_service(group_id: str, group_data: 'GroupUpdate', user: User) -> 'GroupResponse':
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_edit_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to edit group")
    updated_group = update_group_db(group_id, group_data.model_dump())
    from app.schemas.group_schemas import GroupResponse
    return GroupResponse.model_validate(updated_group)

def delete_group_service(group_id: str, user: User) -> dict:
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_edit_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to delete group")
    delete_group_db(group_id)
    return {"message": "Group deleted successfully"}

def add_member_to_group_service(group_id: str, member_data: 'GroupMemberAdd', user: User) -> 'GroupMemberResponse':
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_edit_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to manage group members")
    
    # ИСПРАВЛЕНИЕ: Используем ORM-стиль с сессией из репозитория
    # Проверим, что приглашаемый пользователь существует
    invited_user = get_user_by_id_db(member_data.user_id) # Предполагаем, что такая функция есть в group_repository
    # ИЛИ, если используете file_repository:
    # from app.repositories.file_repository import get_user_by_id # Импортируем, если нужно
    # invited_user = get_user_by_id(member_data.user_id)
    # ИЛИ напрямую через сессию в этом сервисе (менее предпочтительно, но возможно):
    # with get_db_session() as db:
    #     invited_user = db.query(User).filter(User.id == member_data.user_id).first()
    
    if not invited_user:
         raise HTTPException(status_code=404, detail="Invited user not found")
         
    member = GroupMember(
        user_id=member_data.user_id,
        group_id=group_id,
        role=member_data.role,
        invited_by=user.id
    )
    created_member = add_member_to_group_db(member)
    from app.schemas.group_schemas import GroupMemberResponse
    return GroupMemberResponse.model_validate(created_member)

def remove_member_from_group_service(group_id: str, user_id: str, user: User) -> dict:
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_edit_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to manage group members")
    # Проверим, что удаляемый пользователь не является создателем
    if group.creator_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the group creator")
    remove_member_from_group_db(group_id, user_id)
    return {"message": "Member removed successfully"}

def update_member_role_service(group_id: str, user_id: str, role_data: 'GroupMemberUpdate', user: User) -> 'GroupMemberResponse':
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_edit_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to manage group members")
    # Проверим, что пользователь не пытается изменить роль создателя
    if group.creator_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change role of the group creator")
    updated_member = update_member_role_db(group_id, user_id, role_data.role)
    from app.schemas.group_schemas import GroupMemberResponse
    return GroupMemberResponse.model_validate(updated_member)

def get_group_files_service(group_id: str, sort_by: str, sort_order: str, page: int, limit: int, user: User) -> 'GroupFileListResponse':
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_read_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to group files")
    offset = (page - 1) * limit
    sort_column = {"date": "created_at", "name": "original_name", "size": "size", "duration": 'duration'}.get(sort_by, "created_at")
    order = "desc" if sort_order == "desc" else "asc"
    files, total = get_group_files_db(
        group_id=group_id,
        sort_column=sort_column,
        order=order,
        limit=limit,
        offset=offset,
    )
    # Обогащаем файлы метаданными (теги, категории)
    from app.services.file_service import FileMetadataService
    files = FileMetadataService.enrich_files_batch(files)
    from app.schemas.group_schemas import GroupFileListResponse
    from app.schemas.file_schemas import FileResponse
    return GroupFileListResponse(
        files=[FileResponse.model_validate(f) for f in files],
        total=total,
        page=page,
        limit=limit
    )

def add_file_to_group_service(group_id: str, file_id: str, user: User) -> dict:
    group = get_group_by_id_db(group_id)
    file = get_file_by_id_db(file_id)
    if not group or not file:
        raise HTTPException(status_code=404, detail="Group or File not found")
    # Проверка доступа: пользователь должен быть владельцем файла ИЛИ иметь право редактирования в группе
    can_edit_file = file.owner_id == user.id
    can_edit_group = _check_user_can_edit_group(group, user)

    if not (can_edit_file or can_edit_group):
         raise HTTPException(status_code=403, detail="Access denied to add file to group")

    # Удалить файл из всех других групп, где пользователь имеет право редактирования
    # Получаем все группы, к которым принадлежит файл
    current_groups = file.groups
    for current_group in current_groups:
        # Проверяем, может ли пользователь редактировать файл в этой группе
        # Это возможно, если пользователь является владельцем файла или имеет роль editor/admin в группе
        if file.owner_id == user.id or _check_user_can_edit_group(current_group, user):
            # Удаляем файл из текущей группы
            remove_file_from_group_db(current_group.id, file_id)

    # Теперь добавляем файл в новую группу
    add_file_to_group_db(group_id, file_id)
    return {"message": "File added to group successfully"}

def remove_file_from_group_service(group_id: str, file_id: str, user: User) -> dict:
    group = get_group_by_id_db(group_id)
    file = get_file_by_id_db(file_id)
    if not group or not file:
        raise HTTPException(status_code=404, detail="Group or File not found")
    if not _check_user_can_edit_group(group, user) and file.owner_id != user.id:
         # Пользователь не создатель файла и не админ/редактор группы
         raise HTTPException(status_code=403, detail="Access denied to remove file from group")
    # Проверим, что файл действительно в группе
    if group not in file.groups:
        raise HTTPException(status_code=400, detail="File is not in the group")
    remove_file_from_group_db(group_id, file_id)
    return {"message": "File removed from group successfully"}

def get_group_members_service(group_id: str, user: User) -> 'GroupMemberListResponse':
    group = get_group_by_id_db(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _check_user_can_read_group(group, user):
        raise HTTPException(status_code=403, detail="Access denied to group members")
    members = get_group_members_db(group_id)

    validated_members = []
    for m in members:
        # Преобразуем UUID в строку перед валидацией
        member_dict = {
            "user_id": str(m.user.id), # Преобразуем UUID пользователя в строку
            "group_id": str(m.group_id), # Преобразуем UUID группы в строку
            "role": m.role,
            "invited_by": str(m.invited_by) if m.invited_by else None, # Преобразуем, если не None
            "invited_at": m.invited_at,
            "accepted_at": m.accepted_at,
            "revoked_at": m.revoked_at,
            # Создаем вложенный словарь для user
            "user": {
                "id": str(m.user.id), # Преобразуем UUID в строку
                "username": m.user.username,
                "email": m.user.email,
                "is_active": m.user.is_active,
                "is_admin": m.user.is_admin,
                "created_at": m.user.created_at,
                "updated_at": m.user.updated_at,
            }
        }
        validated_members.append(GroupMemberUserResponse.model_validate(member_dict))
    return GroupMemberListResponse(members=validated_members)
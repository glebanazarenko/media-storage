from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileListResponse
from app.schemas.group_schemas import (
    GroupCreate, GroupUpdate, GroupResponse, GroupMemberAdd, GroupMemberUpdate, GroupMemberResponse
)
from app.schemas.group_schemas import GroupFileAdd
from app.services.group_service import (
    create_group_service,
    get_user_groups_service,
    get_group_by_id_service,
    update_group_service,
    delete_group_service,
    add_member_to_group_service,
    remove_member_from_group_service,
    update_member_role_service,
    get_group_files_service,
    add_file_to_group_service,
    remove_file_from_group_service
)

router = APIRouter(prefix="/groups", tags=["Groups"])


@router.post("/", response_model=GroupResponse)
def create_group(
    group_data: GroupCreate,
    current_user: User = Depends(get_current_user),
):
    """Создание новой группы. Создатель становится администратором."""
    return create_group_service(group_data, current_user)


@router.get("/", response_model=List[GroupResponse])
def list_user_groups(
    current_user: User = Depends(get_current_user),
):
    """Получение списка групп, к которым у пользователя есть доступ."""
    return get_user_groups_service(current_user)


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
):
    """Получение информации о конкретной группе (если пользователь имеет к ней доступ)."""
    return get_group_by_id_service(group_id, current_user)


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(
    group_id: str,
    group_data: GroupUpdate,
    current_user: User = Depends(get_current_user),
):
    """Обновление информации о группе (только для администратора/создателя)."""
    return update_group_service(group_id, group_data, current_user)


@router.delete("/{group_id}")
def delete_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
):
    """Удаление группы (только для администратора/создателя)."""
    return delete_group_service(group_id, current_user)


@router.post("/{group_id}/members", response_model=GroupMemberResponse)
def add_member(
    group_id: str,
    member_data: GroupMemberAdd,
    current_user: User = Depends(get_current_user),
):
    """Приглашение пользователя в группу (только для администратора/создателя)."""
    return add_member_to_group_service(group_id, member_data, current_user)


@router.delete("/{group_id}/members/{user_id}")
def remove_member(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Исключение пользователя из группы (только для администратора/создателя)."""
    return remove_member_from_group_service(group_id, user_id, current_user)


@router.put("/{group_id}/members/{user_id}/role", response_model=GroupMemberResponse)
def update_member_role(
    group_id: str,
    user_id: str,
    role_data: GroupMemberUpdate,
    current_user: User = Depends(get_current_user),
):
    """Изменение роли пользователя в группе (только для администратора/создателя)."""
    return update_member_role_service(group_id, user_id, role_data, current_user)


@router.get("/{group_id}/files", response_model=FileListResponse) # Требуется FileListResponse из file_schemas
def list_group_files(
    group_id: str,
    sort_by: str = Query("date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=1000),
    current_user: User = Depends(get_current_user),
):
    """Получение списка файлов в группе (если пользователь имеет к ней доступ)."""
    # Импортируем здесь, чтобы избежать циклических импортов
    from app.schemas.file_schemas import FileListResponse
    return get_group_files_service(group_id, sort_by, sort_order, page, limit, current_user)


@router.post("/{group_id}/files")
def add_file_to_group(
    group_id: str,
    file_data: GroupFileAdd, # Принимаем тело запроса как GroupFileAdd
    current_user: User = Depends(get_current_user),
):
    """Добавление файла в группу (только для пользователей с правами редактирования)."""
    file_id = file_data.file_id
    if not file_id:
         raise HTTPException(status_code=400, detail="file_id is required")
    return add_file_to_group_service(group_id, file_id, current_user)


@router.delete("/{group_id}/files/{file_id}")
def remove_file_from_group(
    group_id: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Удаление файла из группы (только для пользователей с правами редактирования)."""
    return remove_file_from_group_service(group_id, file_id, current_user)

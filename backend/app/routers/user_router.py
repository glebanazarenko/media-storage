from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.user_schemas import UserResponse # Создайте эту схему, если её нет
from app.repositories.auth_repository import get_all_users # Создайте этот репозиторий/функцию

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/", response_model=list[UserResponse]) # Используйте Pydantic-схему для ответа
def list_users(current_user: User = Depends(get_current_user)):
    """Получение списка всех пользователей (ограничено правами администратора)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    users = get_all_users() # Получаем список объектов User
    # Преобразуем каждый объект User в Pydantic модель UserResponse
    # Pydantic автоматически преобразует UUID в строку благодаря from_attributes=True и Config
    return [UserResponse.model_validate(user.to_response_dict()) for user in users] # ИСПРАВЛЕНО: преобразование
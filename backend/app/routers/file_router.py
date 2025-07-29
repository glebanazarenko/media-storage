from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileResponse
from app.services.file_service import get_file_service, save_file_metadata

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/")
def create_file(
    file: UploadFile = File(...),
    description: Optional[str] = None,
    tag_names: str = Form(""),
    current_user: User = Depends(get_current_user),
):
    db_file = save_file_metadata(file, description, tag_names, current_user)
    return FileResponse.model_validate(db_file)


@router.get("/{file_id}")
def get_file(file_id: str):
    file = get_file_service(file_id)
    return FileResponse.model_validate(file)

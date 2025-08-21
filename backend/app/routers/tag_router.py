from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.models.base import Tag, User
from app.schemas.tag_schemas import TagResponse
from app.services.tag_service import search_tags_service

router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("/search", response_model=List[TagResponse])
def search_tags(
    q: str = Query(..., min_length=1, description="Search query for tag names"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of results"),
    current_user: User = Depends(get_current_user),
):
    """
    Search for tags by name for the current user's files.

    - **q**: Search query (required)
    - **limit**: Number of results to return (default: 10, min: 1, max: 100)
    """
    return search_tags_service(q, limit, current_user.id)

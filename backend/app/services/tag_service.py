from typing import List
from uuid import UUID

from app.repositories.tag_repository import search_tags


def search_tags_service(query: str, limit: int, user_id: UUID) -> List:
    """
    Service function to search tags for a specific user.

    Args:
        query: Search query string
        limit: Maximum number of results
        user_id: ID of the current user

    Returns:
        List of tag objects
    """
    return search_tags(query, limit, user_id)

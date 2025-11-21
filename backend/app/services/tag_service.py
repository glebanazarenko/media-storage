from typing import List
from uuid import UUID

from app.repositories.tag_repository import search_tags, get_popular_tags_with_usage_count


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


def get_popular_tags_service(limit: int, user_id: UUID) -> List[dict]:
    """
    Service function to get popular tags for a specific user with usage count.

    Args:
        limit: Maximum number of results
        user_id: ID of the current user

    Returns:
        List of dictionaries containing tag details and usage count
    """
    return get_popular_tags_with_usage_count(limit, user_id)

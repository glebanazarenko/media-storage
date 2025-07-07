from fastapi import APIRouter, Depends, HTTPException
from app.models.group import Group
from app.models.group_member import GroupMember
from app.models.user import User
# from app.schemas.group import GroupCreate, GroupResponse
from app.core.database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/groups", tags=["Groups"])

# @router.post("/")
# def create_group(
#     group: GroupCreate,
#     db: Session = Depends(get_db)
# ):
#     db_group = Group(**group.model_dump())
#     db.add(db_group)
#     db.commit()
#     db.refresh(db_group)
#     return GroupResponse.model_validate(db_group)

# @router.post("/{group_id}/members")
# def add_member_to_group(
#     group_id: str,
#     user_id: str,
#     role: str = "reader",
#     db: Session = Depends(get_db)
# ):
#     db_group = db.query(Group).get(group_id)
#     if not db_group:
#         raise HTTPException(status_code=404, detail="Group not found")

#     existing = db.query(GroupMember).filter_by(user_id=user_id, group_id=group_id).first()
#     if existing:
#         raise HTTPException(status_code=400, detail="User already in group")

#     db_member = GroupMember(
#         user_id=user_id,
#         group_id=group_id,
#         role=role
#     )
#     db.add(db_member)
#     db.commit()
#     return {"status": "success", "message": "User added to group"}
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

# from app.schemas.tag import TagCreate, TagResponse
from app.core.database import get_db
from app.models.tag import Tag

router = APIRouter(prefix="/tags", tags=["Tags"])

# @router.post("/")
# def create_tag(tag: TagCreate, db: Session = Depends(get_db)):
#     db_tag = Tag(**tag.model_dump())
#     db.add(db_tag)
#     db.commit()
#     db.refresh(db_tag)
#     return TagResponse.model_validate(db_tag)

# @router.get("/")
# def list_tags(db: Session = Depends(get_db)):
#     tags = db.query(Tag).all()
#     return [TagResponse.model_validate(tag) for tag in tags]

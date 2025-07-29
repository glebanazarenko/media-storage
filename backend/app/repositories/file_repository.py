from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.models.base import File as DBFile
from app.schemas.file_schemas import FileCreate


def create_file(file_data: FileCreate):
    with get_db_session() as db:
        db_file = DBFile(**file_data.model_dump())
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        return db_file


def get_file_by_id(file_id: str):
    with get_db_session() as db:
        return db.query(DBFile).filter(DBFile.id == file_id).first()

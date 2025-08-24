from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.core.database import s3_client


def upload_file_to_s3(file: UploadFile, key: str):
    from app.main import logger

    try:
        s3_client.upload_fileobj(file.file, settings.AWS_S3_BUCKET_NAME, key)
    except ClientError as e:
        logger.info(e)
        raise HTTPException(status_code=500, detail=f"Failed to upload to S3: {e}")

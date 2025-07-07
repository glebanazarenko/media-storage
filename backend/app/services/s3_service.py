import boto3

from app.core.config import settings

s3_client = boto3.client(
    "s3",
    endpoint_url=settings.AWS_S3_ENDPOINT_URL,
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
)


def upload_file_to_s3(file_path: str, key: str):
    s3_client.upload_file(file_path, settings.AWS_S3_BUCKET_NAME, key)

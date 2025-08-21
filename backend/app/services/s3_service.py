import os
import tempfile
from io import BytesIO

import boto3
import cv2
from fastapi import UploadFile
from PIL import Image

from app.core.config import settings

s3_client = boto3.client(
    "s3",
    endpoint_url=settings.AWS_S3_ENDPOINT_URL,
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
)


def upload_file_to_s3(file_path: str, key: str):
    s3_client.upload_file(file_path, settings.AWS_S3_BUCKET_NAME, key)


def create_image_thumbnail(file_content: bytes, content_type: str, key: str) -> str:
    """Создает thumbnail для изображения из байтов"""
    try:
        # Создаем thumbnail
        image = Image.open(BytesIO(file_content))
        image.thumbnail((300, 300), Image.Resampling.LANCZOS)

        # Конвертируем изображение в RGB если нужно (для GIF и других форматов)
        if image.mode in ("P", "RGBA", "LA"):
            # Для изображений с прозрачностью используем белый фон
            if image.mode in ("RGBA", "LA"):
                # Создаем белый фон
                background = Image.new("RGB", image.size, (255, 255, 255))
                # Накладываем изображение на фон
                if image.mode == "RGBA":
                    background.paste(
                        image, mask=image.split()[-1]
                    )  # используем альфа-канал как маску
                else:
                    background.paste(image, mask=image.split()[-1])
                image = background
            else:
                # Для палитровых изображений (GIF) конвертируем напрямую
                image = image.convert("RGB")

        # Сохраняем в временный файл
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            image.save(tmp_file, "JPEG", quality=85)
            tmp_file_path = tmp_file.name

        # Загружаем на S3
        thumbnail_key = f"uploads/{key.split('/')[-1]}.jpg"
        with open(tmp_file_path, "rb") as f:
            upload_file_to_s3_bytes(f.read(), thumbnail_key, "image/jpeg")

        # Удаляем временный файл
        os.unlink(tmp_file_path)

        return thumbnail_key
    except Exception as e:
        print(f"Error creating image thumbnail: {e}")
        return None


def create_video_thumbnail(file_content: bytes, key: str) -> str:
    """Создает thumbnail для видео (первый кадр) из байтов"""
    try:
        # Сохраняем видео во временный файл для обработки
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_video:
            tmp_video.write(file_content)
            tmp_video_path = tmp_video.name

        # Извлекаем первый кадр
        cap = cv2.VideoCapture(tmp_video_path)
        ret, frame = cap.read()

        if ret:
            # Изменяем размер кадра
            height, width = frame.shape[:2]
            max_size = 300
            if width > height:
                new_width = max_size
                new_height = int(height * (max_size / width))
            else:
                new_height = max_size
                new_width = int(width * (max_size / height))

            frame = cv2.resize(frame, (new_width, new_height))

            # Сохраняем кадр как изображение
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_image:
                cv2.imwrite(tmp_image.name, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                tmp_image_path = tmp_image.name

            # Загружаем на S3
            thumbnail_key = f"uploads/{key.split('/')[-1]}.jpg"
            with open(tmp_image_path, "rb") as f:
                upload_file_to_s3_bytes(f.read(), thumbnail_key, "image/jpeg")

            # Удаляем временные файлы
            os.unlink(tmp_image_path)
            os.unlink(tmp_video_path)
            cap.release()

            return thumbnail_key
        else:
            os.unlink(tmp_video_path)
            cap.release()
            return None

    except Exception as e:
        print(f"Error creating video thumbnail: {e}")
        return None


def upload_file_to_s3_bytes(content: bytes, key: str, content_type: str):
    """Загружает байты на S3"""
    s3_client.put_object(
        Bucket=settings.AWS_S3_BUCKET_NAME,
        Key=key,
        Body=content,
        ContentType=content_type,
    )

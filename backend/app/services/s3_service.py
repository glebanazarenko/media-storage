import os
import tempfile
from io import BytesIO

import cv2
from PIL import Image

from app.core.config import settings
from app.core.database import s3_client


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


def create_thumbnail_from_s3(s3_key: str, content_type: str) -> str:
    """Создает превью, скачивая файл по частям"""
    from app.main import logger
    
    try:
        # Скачиваем файл во временный файл, а не в память
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            s3_client.download_fileobj(settings.AWS_S3_BUCKET_NAME, s3_key, temp_file)
            temp_file_path = temp_file.name

        # Создаем превью из временного файла
        thumbnail_key = None
        if content_type.startswith("image/"):
            thumbnail_key = create_image_thumbnail_from_file(temp_file_path, s3_key)
        elif content_type.startswith("video/"):
            thumbnail_key = create_video_thumbnail_from_file(temp_file_path, s3_key)
        
        # Удаляем временный файл
        os.unlink(temp_file_path)
        return thumbnail_key
        
    except Exception as e:
        logger.error(f"Error creating thumbnail: {e}")
        return None
    

def create_image_thumbnail_from_file(file_path: str, original_key: str) -> str:
    """Создает thumbnail для изображения из файла на диске"""
    try:
        # Создаем thumbnail
        image = Image.open(file_path)
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
        thumbnail_key = f"uploads/{original_key.split('/')[-1]}.jpg"
        with open(tmp_file_path, "rb") as f:
            upload_file_to_s3_bytes(f.read(), thumbnail_key, "image/jpeg")

        # Удаляем временный файл
        os.unlink(tmp_file_path)

        return thumbnail_key
    except Exception as e:
        print(f"Error creating image thumbnail from file: {e}")
        return None


def create_video_thumbnail_from_file(file_path: str, original_key: str) -> str:
    """Создает thumbnail для видео (первый кадр) из файла на диске"""
    try:
        # Извлекаем первый кадр из видео файла
        cap = cv2.VideoCapture(file_path)
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
            thumbnail_key = f"uploads/{original_key.split('/')[-1]}.jpg"
            with open(tmp_image_path, "rb") as f:
                upload_file_to_s3_bytes(f.read(), thumbnail_key, "image/jpeg")

            # Удаляем временные файлы
            os.unlink(tmp_image_path)
            cap.release()

            return thumbnail_key
        else:
            cap.release()
            return None

    except Exception as e:
        print(f"Error creating video thumbnail from file: {e}")
        if 'cap' in locals():
            cap.release()
        return None
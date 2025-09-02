from typing import Optional
import mimetypes
from urllib.parse import quote

from botocore.exceptions import ClientError
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.database import s3_client
from app.core.security import get_current_user
from app.models.base import User
from app.schemas.file_schemas import FileListResponse, FileResponse
from app.services.file_service import (
    delete_file_service,
    download_file_service,
    get_file_service,
    get_files_list,
    save_file_metadata,
    search_files_service,
    stream_file_service,
    update_file_metadata,
    download_file_from_url_service,
)
from app.repositories.file_repository import get_file_by_id

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/", response_model=FileResponse)
def create_file(
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    tag_names: str = Form(""),
    category: str = Form("0-plus"),
    current_user: User = Depends(get_current_user),
):
    return save_file_metadata(file, description, tag_names, category, current_user)


@router.get("/", response_model=FileListResponse)
def list_files(
    category: str = Query("all"),
    sort_by: str = Query("date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
):
    return get_files_list(
        category=category,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        limit=limit,
        user_id=current_user.id,
    )


@router.get("/{file_id}/stream")
def stream_file(
    file_id: str,
    request: Request,
    range_header: str = Header(None),
    current_user: User = Depends(get_current_user),
):
    try:
        # Вызываем сервис стриминга
        stream_data = stream_file_service(file_id, range_header, current_user.id)
        s3_response = stream_data["s3_response"]
        # file = stream_data["file"] # Не используется напрямую здесь
        start = stream_data["start"]
        end = stream_data["end"]
        status_code = stream_data["status_code"]
        headers = stream_data["headers"]
        # file_size = stream_data["file_size"] # Не используется напрямую здесь
        # mime_type = stream_data["mime_type"] # Не используется напрямую здесь

        # --- ИСПРАВЛЕНИЕ НАЧАЛО ---
        # Вычисляем content_length заранее, вне блока try генератора
        calculated_content_length = end - start + 1

        # Создаем генератор для стриминга
        def iter_file():
            # Инициализируем bytes_read на уровне функции, вне try
            bytes_read = 0
            # Используем calculated_content_length из внешней области видимости
            content_length = calculated_content_length
            chunk_size = 64 * 1024 # 64KB chunks
            
            try:
                # Читаем из S3 по частям и сразу отдаем клиенту
                while bytes_read < content_length:
                    # Вычисляем, сколько байт читать в этой итерации
                    read_size = min(chunk_size, content_length - bytes_read)
                    # Читаем чанк из тела ответа S3
                    chunk = s3_response["Body"].read(read_size)
                    # Если чанк пустой, значит, данные закончились
                    if not chunk:
                        # Это может быть неожиданно, если bytes_read < content_length
                        # Но мы все равно выходим из цикла
                        break
                    # Увеличиваем счетчик прочитанных байт
                    # Теперь bytes_read точно определен
                    bytes_read += len(chunk)
                    # Отдаем чанк клиенту
                    yield chunk
            except Exception as e:
                print(f"Error during streaming chunk: {e}")
                # Можно логировать ошибку, но повторно выбрасывать её внутри генератора
                # может быть сложно обработать корректно в контексте StreamingResponse.
                # Лучше позволить генератору завершиться.
                # Однако, если клиент отключился, это нормально.
                # FastAPI/Uvicorn должны обработать это.
                # Просто завершаем генератор.
                # yield b"" # Не обязательно
                return # Завершаем генератор
            finally:
                # Всегда закрываем поток из S3
                try:
                    s3_response["Body"].close()
                except Exception as e:
                    print(f"Error closing S3 stream: {e}")
                    # Игнорируем ошибки закрытия
                    pass
        
        # Получаем mime_type после обработки ошибок сервиса, но до создания генератора
        # на случай, если сервис бросит исключение.
        mime_type = (
            stream_data["file"].mime_type # Получаем из файла, полученного сервисом
            or s3_response.get("ContentType")
            or "application/octet-stream"
        )
        # --- ИСПРАВЛЕНИЕ КОНЕЦ ---

        # Правильно кодируем имя файла для заголовка
        safe_filename = quote(stream_data["file"].original_name.encode("utf-8"))
        content_disposition = f"inline; filename*=UTF-8''{safe_filename}"

        # Добавляем заголовки (перезаписываем или добавляем)
        # Убедимся, что Content-Length соответствует запрошенному диапазону
        headers.update(
            {
                "Content-Disposition": content_disposition,
                "Content-Length": str(calculated_content_length), # Используем заранее вычисленное значение
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            }
        )

        return StreamingResponse(
            iter_file(), # Передаем генератор
            status_code=status_code,
            media_type=mime_type,
            headers=headers,
        )
    except ClientError as e:
        print(f"S3 Client Error for file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"S3 Client Error: {str(e)}")
    except HTTPException:
        # Пробрасываем HTTP исключения без изменений
        raise
    except Exception as e:
        print(f"Unexpected error streaming file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.get("/{file_id}/manifest/{manifest_type}/{manifest_name:path}")
def get_manifest(
    file_id: str,
    manifest_type: str, # "hls" или "dash"
    manifest_name: str, # путь к манифесту, например "master.m3u8" или "stream_720p/playlist.m3u8"
    current_user: User = Depends(get_current_user),
):
    """Отдает манифест (HLS или DASH) из S3."""
    try:
        file = get_file_by_id(file_id)
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        # Проверяем права доступа
        if file.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Определяем путь к манифесту в S3
        s3_manifest_key = None
        if manifest_type == "hls" and file.hls_manifest_path:
            # Извлекаем базовый путь из hls_manifest_path
            base_hls_path = "/".join(file.hls_manifest_path.split("/")[:-1]) # Убираем имя файла
            s3_manifest_key = f"{base_hls_path}/{manifest_name}"
        # elif manifest_type == "dash" and file.dash_manifest_path:
        #     # Аналогично для DASH
        #     base_dash_path = "/".join(file.dash_manifest_path.split("/")[:-1])
        #     s3_manifest_key = f"{base_dash_path}/{manifest_name}"
        else:
            raise HTTPException(status_code=404, detail="Manifest not found or transcoding not completed")

        # Запрашиваем манифест из S3
        try:
            s3_response = s3_client.get_object(Bucket=settings.AWS_S3_BUCKET_NAME, Key=s3_manifest_key)
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise HTTPException(status_code=404, detail="Manifest not found in storage")
            else:
                raise HTTPException(status_code=500, detail=f"S3 error: {str(e)}")

        # Определяем Content-Type
        content_type, _ = mimetypes.guess_type(manifest_name)
        if not content_type:
            if manifest_name.endswith('.m3u8'):
                content_type = 'application/vnd.apple.mpegurl' # Или 'audio/mpegurl'
            elif manifest_name.endswith('.mpd'):
                 content_type = 'application/dash+xml'
            else:
                content_type = 'application/octet-stream'

        # Создаем генератор для стриминга
        def iter_file():
            try:
                for chunk in s3_response['Body'].iter_chunks(chunk_size=64 * 1024): # 64KB
                    yield chunk
            except Exception as e:
                print(f"Error streaming manifest chunk: {e}")
                return
            finally:
                try:
                    s3_response['Body'].close()
                except:
                    pass

        return StreamingResponse(
            iter_file(),
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=300", # Манифесты могут меняться, кэшируем коротко
                 "Accept-Ranges": "bytes", # Полезно для Range-запросов к сегментам, если нужно
            }
        )

    except HTTPException:
        raise
    except Exception as e:
         print(f"Unexpected error getting manifest {manifest_name} for file {file_id}: {e}")
         raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/thumbnail/{key}")
async def get_thumbnail(key: str):
    try:
        obj = s3_client.get_object(
            Bucket=settings.AWS_S3_BUCKET_NAME, Key=f"uploads/{key}"
        )

        # Возвращаем содержимое как файл
        return Response(
            content=obj["Body"].read(),
            media_type="image/jpeg",  # или определяйте по Content-Type
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail="Thumbnail not found")


@router.get("/search", response_model=FileListResponse)
def search_files_endpoint(
    query: str = Query(None),
    category: str = Query("all"),
    include_tags: str = Query("", alias="includeTags"),
    exclude_tags: str = Query("", alias="excludeTags"),
    min_duration: Optional[float] = Query(None, alias="minDuration"), # Минимальная длительность в секундах
    max_duration: Optional[float] = Query(None, alias="maxDuration"), # Максимальная длительность в секундах
    sort_by: str = Query("date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
):
    """Поиск файлов по запросу, категориям, тегам и другим параметрам."""
    result = search_files_service(
        query=query,
        category=category,
        include_tags=include_tags,
        exclude_tags=exclude_tags,
        min_duration=min_duration,
        max_duration=max_duration,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        limit=limit,
        user_id=current_user.id,
    )

    return result


@router.put("/{file_id}", response_model=FileResponse)
def update_file(
    file_id: str,
    description: Optional[str] = Form(None),
    tag_names: str = Form(""),
    category: str = Form("0-plus"),
    current_user: User = Depends(get_current_user),
):
    """Обновление метаданных файла"""
    try:
        updated_file = update_file_metadata(
            file_id=file_id,
            description=description,
            tag_names=tag_names,
            category=category,
            user_id=current_user.id,
        )
        return FileResponse.model_validate(updated_file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Удаление файла"""
    try:
        result = delete_file_service(file_id, current_user.id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Скачивание оригинального файла"""
    try:
        # Вызываем сервис скачивания
        download_data = download_file_service(file_id, current_user.id)

        s3_response = download_data["s3_response"]
        file = download_data["file"]

        # Заголовки для скачивания файла
        safe_filename = quote(file.original_name.encode("utf-8"))

        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}",
            "Content-Length": str(file.size),
            "Content-Type": file.mime_type or "application/octet-stream",
        }

        return Response(
            content=s3_response["Body"].read(),
            headers=headers,
            media_type=file.mime_type or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/download-from-url", response_model=FileResponse)
def download_file_from_url(
    url_data: dict,
    current_user: User = Depends(get_current_user),
):
    """Загрузка файла по URL"""
    try:
        url = url_data.get("url")
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        # Вызываем сервис для загрузки файла
        result = download_file_from_url_service(url, current_user)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{file_id}", response_model=FileResponse)
def get_file(file_id: str):
    file = get_file_service(file_id)
    return FileResponse.model_validate(file)

import os
import uuid
import subprocess
import shutil
import logging
import json
import concurrent.futures
from typing import List, Dict, Any, Optional

from app.core.config import settings
from app.models.base import File
from app.core.database import get_db_session, s3_client

# --- Настройки пула потоков и ресурсов ---
# Максимальное количество одновременных задач транскодирования
MAX_WORKERS = 1 # Строго 1 для слабого сервера
# Максимальное количество потоков ЦП для ОДНОГО процесса ffmpeg
FFMPEG_THREADS = 1 # Только 1 ядро на процесс
# Приоритет nice для процесса ffmpeg (от -20 до 19, чем выше, тем ниже приоритет)
FFMPEG_NICE = 19 # Минимальный приоритет (очень низкий)
# Очень щадящие настройки кодирования
FFMPEG_PRESET = "veryslow" # Самый медленный, но самый легкий для CPU
# --- Таймауты ---
BASE_TIMEOUT = 10800      # 3 часа минут базовый таймаут
TIMEOUT_PER_GB = 3600    # 60 минут на ГБ
MAX_TIMEOUT = 10800      # Максимум 3 часа (10800 секунд)
# Длительность сегмента HLS
SEGMENT_DURATION = 6     # Увеличено до 6 секунд

# Создаем пул потоков на уровне модуля
executor = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS)

# Настройка логгирования
logger = logging.getLogger(__name__)

def _get_file_size_mb(file_path: str) -> float:
    """Получает размер файла в мегабайтах."""
    try:
        size_bytes = os.path.getsize(file_path)
        return size_bytes / (1024 * 1024)
    except OSError as e:
        logger.warning(f"Could not get file size for {file_path}: {e}")
        return 0.0

def _calculate_timeout(file_path: str) -> int:
    """Рассчитывает таймаут на основе размера файла."""
    file_size_mb = _get_file_size_mb(file_path)
    file_size_gb = file_size_mb / 1024
    timeout = BASE_TIMEOUT + int(file_size_gb * TIMEOUT_PER_GB)
    return max(BASE_TIMEOUT, min(timeout, MAX_TIMEOUT))

def _probe_audio_streams(file_path: str) -> bool:
    """Проверяет наличие аудио потоков в файле."""
    try:
        probe_cmd = f"ffprobe -v quiet -print_format json -show_streams '{file_path}'"
        result = subprocess.run(
            probe_cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            probe_data = json.loads(result.stdout)
            audio_streams = [s for s in probe_data.get("streams", []) if s.get("codec_type") == "audio"]
            return len(audio_streams) > 0
        else:
            logger.warning(f"ffprobe failed for {file_path}: {result.stderr}")
    except Exception as e:
        logger.warning(f"Error probing audio streams for {file_path}: {e}")
    return True

def _build_ffmpeg_command(
    input_path: str,
    output_dir: str,
    renditions: List[Dict[str, Any]],
    segment_duration: int,
    has_audio: bool
) -> List[str]:
    """Строит команду ffmpeg для HLS транскодирования как список аргументов."""
    num_renditions = len(renditions)

    # Начинаем с команды nice и ffmpeg
    cmd_args = [
        "nice", "-n", str(FFMPEG_NICE),
        "ffmpeg", "-y", "-threads", str(FFMPEG_THREADS),
        "-i", input_path,
        "-preset", FFMPEG_PRESET
    ]

    # Создаем фильтры
    video_splits = "".join([f"[v{i}]" for i in range(num_renditions)])
    filter_parts = [f"[0:v]split={num_renditions}{video_splits}"]

    for i, rendition in enumerate(renditions):
        height = rendition["height"]
        filter_parts.append(f"[v{i}]scale=-2:{height},setsar=1[vout{i}]")

    if has_audio:
        audio_splits = "".join([f"[a{i}]" for i in range(num_renditions)])
        filter_parts.insert(1, f"[0:a]asplit={num_renditions}{audio_splits}")
        for i in range(num_renditions):
            filter_parts.append(f"[a{i}]anull[aout{i}]")

    filter_complex = ";".join(filter_parts)
    cmd_args.extend(["-filter_complex", filter_complex])

    # Добавляем map для каждого выхода фильтра
    for i in range(num_renditions):
        cmd_args.extend(["-map", f"[vout{i}]"])
        if has_audio:
            cmd_args.extend(["-map", f"[aout{i}]"])

    # Формируем var_stream_map
    var_stream_map_parts = []
    for i in range(num_renditions):
        if has_audio:
            var_stream_map_parts.append(f"v:{i},a:{i}")
        else:
            var_stream_map_parts.append(f"v:{i}")
    var_stream_map = " ".join(var_stream_map_parts)

    # Добавляем остальные параметры HLS
    cmd_args.extend([
        "-var_stream_map", var_stream_map,
        "-master_pl_name", "master.m3u8",
        "-f", "hls",
        "-hls_time", str(segment_duration),
        "-hls_list_size", "0",
        "-hls_segment_filename", f"{output_dir}/stream_%v/segment_%04d.ts",
    ])

    # Параметры кодирования для каждой рендиции
    for i, rendition in enumerate(renditions):
        cmd_args.extend([f"-b:v:{i}", rendition['video_bitrate']])
        if has_audio:
            cmd_args.extend([f"-b:a:{i}", rendition['audio_bitrate']])

    # Выходной файл (шаблон)
    cmd_args.append(f"{output_dir}/stream_%v/playlist.m3u8")

    return cmd_args

def _run_ffmpeg_with_timeout(cmd_args: List[str], timeout: int) -> bool:
    """Запускает команду ffmpeg с таймаутом и логгированием."""
    try:
        cmd_str = " ".join(cmd_args)
        logger.info(f"Running FFmpeg command with timeout {timeout}s: {cmd_str}")

        # Запуск без shell=True для лучшей безопасности и обработки аргументов
        result = subprocess.run(
            cmd_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout
        )
        logger.info(f"FFmpeg command output (return code {result.returncode}):\n{result.stdout}")
        if result.returncode != 0:
            logger.error(f"FFmpeg error (return code {result.returncode})")
            return False
        logger.info("FFmpeg command completed successfully")
        return True
    except subprocess.TimeoutExpired:
        logger.error(f"FFmpeg command timed out after {timeout} seconds")
        return False
    except Exception as e:
        logger.error(f"Exception running FFmpeg command: {e}")
        return False

def _upload_to_s3(local_dir: str, s3_base_path: str, file_id: str):
    """Загружает файлы из локальной директории в S3."""
    logger.info(f"Uploading transcoded files from {local_dir} to S3 path {s3_base_path} for file ID: {file_id}")
    s3_hls_path = f"{s3_base_path}/hls"

    master_playlist_local = os.path.join(local_dir, "master.m3u8")
    if os.path.exists(master_playlist_local):
        s3_key_master = f"{s3_hls_path}/master.m3u8"
        logger.info(f"Uploading master playlist to S3: {s3_key_master}")
        s3_client.upload_file(master_playlist_local, settings.AWS_S3_BUCKET_NAME, s3_key_master)
    else:
        logger.error(f"Master playlist not found at {master_playlist_local}")
        raise FileNotFoundError(f"Master playlist not found at {master_playlist_local}")

    # Загружаем сегменты и плейлисты для каждой рендиции
    for item in os.listdir(local_dir):
        item_path = os.path.join(local_dir, item)
        if os.path.isdir(item_path) and item.startswith("stream_"):
            logger.info(f"Uploading rendition directory {item} to S3")
            for filename in os.listdir(item_path):
                local_file_path = os.path.join(item_path, filename)
                if os.path.isfile(local_file_path):
                    s3_key = f"{s3_hls_path}/{item}/{filename}"
                    logger.debug(f"Uploading {local_file_path} to S3: {s3_key}")
                    s3_client.upload_file(local_file_path, settings.AWS_S3_BUCKET_NAME, s3_key)

def _transcode_video_task_internal(file_id: str):
    """Внутренняя функция, выполняющая фактическое транскодирование."""
    logger.info(f"[Worker Thread] Transcoding task started for file ID: {file_id}")
    temp_dir: Optional[str] = None
    try:
        with get_db_session() as db:
            file_record = db.query(File).filter(File.id == file_id).first()
            if not file_record:
                logger.error(f"[Worker Thread] File with id {file_id} not found for transcoding.")
                return

            if not file_record.mime_type or not file_record.mime_type.startswith("video/"):
                logger.info(f"[Worker Thread] File {file_id} is not a video, skipping transcoding.")
                file_record.transcoding_status = "completed"
                # commit handled by context manager
                return

            logger.info(f"[Worker Thread] Setting transcoding status to 'processing' for file ID: {file_id}")
            file_record.transcoding_status = "processing"
            db.commit()

            temp_dir = f"/tmp/transcode_{uuid.uuid4()}"
            os.makedirs(temp_dir, exist_ok=True)
            original_local_path = os.path.join(temp_dir, "original.mp4")
            output_dir = os.path.join(temp_dir, "output", "hls")
            os.makedirs(output_dir, exist_ok=True)

            logger.info(f"[Worker Thread] Downloading file {file_record.file_path} from S3 to {original_local_path}")
            s3_client.download_file(settings.AWS_S3_BUCKET_NAME, file_record.file_path, original_local_path)

            # --- Настройки транскодирования ---
            # Минимум рендиций для экономии ресурсов
            renditions: List[Dict[str, Any]] = [
                {"name": "360p", "height": 360, "video_bitrate": "500k", "audio_bitrate": "64k"}, # Очень низкие битрейты
                {"name": "480p", "height": 480, "video_bitrate": "800k", "audio_bitrate": "96k"},
                # {"name": "720p", "height": 720, "video_bitrate": "1500k", "audio_bitrate": "128k"}, // Можно добавить позже
            ]

            has_audio = _probe_audio_streams(original_local_path)
            logger.info(f"[Worker Thread] Audio streams detected: {has_audio}")

            ffmpeg_cmd_args = _build_ffmpeg_command(
                original_local_path, output_dir, renditions, SEGMENT_DURATION, has_audio
            )

            timeout = _calculate_timeout(original_local_path)
            if not _run_ffmpeg_with_timeout(ffmpeg_cmd_args, timeout):
                raise Exception("HLS transcoding failed")

            base_s3_path = f"transcoded/{file_record.id}"
            _upload_to_s3(os.path.join(temp_dir, "output", "hls"), base_s3_path, file_id)

            logger.info(f"[Worker Thread] Setting transcoding status to 'completed' for file ID: {file_id}")
            file_record.hls_manifest_path = f"{base_s3_path}/hls/master.m3u8"
            file_record.transcoding_status = "completed"
            logger.info(f"[Worker Thread] Transcoding completed successfully for file {file_id}")

    except Exception as e:
        logger.error(f"[Worker Thread] Error during transcoding for file {file_id}: {e}", exc_info=True)
        try:
            # Открываем новую сессию для обновления статуса на "failed"
            with get_db_session() as db_fail:
                file_record_fail = db_fail.query(File).filter(File.id == file_id).first()
                if file_record_fail:
                    logger.info(f"[Worker Thread] Updating transcoding status to 'failed' for file ID: {file_id}")
                    file_record_fail.transcoding_status = "failed"
                    # commit handled by context manager
        except Exception as db_error:
            logger.error(f"[Worker Thread] Error updating DB status to 'failed' for file {file_id}: {db_error}")
    finally:
        if temp_dir and os.path.exists(temp_dir):
            logger.info(f"[Worker Thread] Cleaning up temporary files for file ID: {file_id} (path: {temp_dir})")
            shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info(f"[Worker Thread] Transcoding task finished for file ID: {file_id}")

def start_transcoding(file_id: str):
    """Запуск задачи транскодирования через пул потоков."""
    logger.info(f"Scheduling transcoding task for file ID: {file_id}")
    # Отправляем задачу в пул потоков
    future = executor.submit(_transcode_video_task_internal, file_id)
    # Для production с Celery это будет выглядеть как task.delay()

# --- Опционально: Функция для корректного завершения пула ---
# def shutdown_executor():
#     executor.shutdown(wait=True)
#     logger.info("Transcoding executor shut down.")
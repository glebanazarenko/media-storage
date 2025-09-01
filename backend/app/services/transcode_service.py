import os
import uuid
import shutil
import logging
import concurrent.futures
from typing import List, Dict, Any, Optional

import ffmpeg

from app.core.config import settings
from app.models.base import File
from app.core.database import get_db_session, s3_client

# --- Настройки пула потоков и ресурсов ---
MAX_WORKERS = 1
FFMPEG_THREADS = 1
FFMPEG_NICE = 19
FFMPEG_PRESET = "ultrafast"
# --- Таймауты ---
BASE_TIMEOUT = 10800
TIMEOUT_PER_GB = 3600
MAX_TIMEOUT = 10800
SEGMENT_DURATION = 10  # Увеличено для скорости
# --- Оптимизации ---
USE_COPY_CODEC = True  # Попытка копирования без перекодирования

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
        probe = ffmpeg.probe(file_path)
        audio_streams = [stream for stream in probe['streams'] if stream['codec_type'] == 'audio']
        return len(audio_streams) > 0
    except Exception as e:
        logger.warning(f"Error probing audio streams for {file_path}: {e}")
    return True

def _can_copy_codec(input_path: str) -> tuple[bool, str, str]:
    """Проверяет, можно ли использовать copy codec"""
    try:
        probe = ffmpeg.probe(input_path)
        video_stream = next((s for s in probe['streams'] if s['codec_type'] == 'video'), None)
        audio_stream = next((s for s in probe['streams'] if s['codec_type'] == 'audio'), None)
        
        video_codec = video_stream.get('codec_name', '') if video_stream else ''
        audio_codec = audio_stream.get('codec_name', '') if audio_stream else ''
        
        # Проверяем поддерживаемые кодеки для HLS
        supported_video = video_codec in ['h264', 'hevc']
        supported_audio = audio_codec in ['aac', 'mp3']
        
        return supported_video and supported_audio, video_codec, audio_codec
    except Exception as e:
        logger.warning(f"Error checking copy codec capability: {e}")
        return False, '', ''

def _get_all_renditions() -> List[Dict[str, Any]]:
    """Все рендитции: 360p, 480p, 720p, 1080p"""
    return [
        {"name": "360p", "height": 360, "video_bitrate": "300k", "audio_bitrate": "48k"}
    ]

def _try_copy_transcode_all(input_path: str, output_dir: str, segment_duration: int, has_audio: bool, renditions: List[Dict[str, Any]]) -> bool:
    """Попытка транскодирования без перекодирования для всех рендитций"""
    try:
        # Создаем директории для всех рендитций
        for i, rendition in enumerate(renditions):
            stream_dir = os.path.join(output_dir, f"stream_{i}")
            os.makedirs(stream_dir, exist_ok=True)
        
        # Копируем исходный файл в каждый поток
        for i, rendition in enumerate(renditions):
            stream_dir = os.path.join(output_dir, f"stream_{i}")
            playlist_path = os.path.join(stream_dir, 'playlist.m3u8')
            
            # Для каждого потока создаем отдельный плейлист с тем же видео
            stream = ffmpeg.input(input_path)
            
            if has_audio:
                output = ffmpeg.output(
                    stream.video, stream.audio,
                    playlist_path,
                    format='hls',
                    hls_time=segment_duration,
                    hls_list_size=0,
                    c='copy',  # Копируем без перекодирования
                    threads=FFMPEG_THREADS
                )
            else:
                output = ffmpeg.output(
                    stream.video,
                    playlist_path,
                    format='hls',
                    hls_time=segment_duration,
                    hls_list_size=0,
                    c='copy',
                    threads=FFMPEG_THREADS
                )
            
            ffmpeg.run(output, overwrite_output=True, quiet=True)
            logger.info(f"Copy transcode successful for rendition {rendition['name']}")
        
        return True
        
    except Exception as e:
        logger.warning(f"Copy transcode failed for all renditions: {e}")
        return False

def _build_fast_hls_commands(
    input_path: str,
    output_dir: str,
    renditions: List[Dict[str, Any]],
    segment_duration: int,
    has_audio: bool
) -> List[Any]:
    """Строит максимально быстрые команды для всех рендитций"""
    
    commands = []
    
    for i, rendition in enumerate(renditions):
        stream_dir = os.path.join(output_dir, f"stream_{i}")
        os.makedirs(stream_dir, exist_ok=True)
        
        try:
            stream = ffmpeg.input(input_path)
            
            # Простое масштабирование без сложных фильтров
            video = stream.video.filter('scale', -2, rendition['height'])
            
            if has_audio:
                audio = stream.audio
                output = ffmpeg.output(
                    video, audio,
                    os.path.join(stream_dir, 'playlist.m3u8'),
                    format='hls',
                    hls_time=segment_duration,
                    hls_list_size=0,
                    video_bitrate=rendition['video_bitrate'],
                    audio_bitrate=rendition['audio_bitrate'],
                    preset=FFMPEG_PRESET,
                    threads=FFMPEG_THREADS,
                    crf=28,  # Более низкое качество для скорости
                    maxrate=rendition['video_bitrate'],
                    bufsize=rendition['video_bitrate']
                )
            else:
                output = ffmpeg.output(
                    video,
                    os.path.join(stream_dir, 'playlist.m3u8'),
                    format='hls',
                    hls_time=segment_duration,
                    hls_list_size=0,
                    video_bitrate=rendition['video_bitrate'],
                    preset=FFMPEG_PRESET,
                    threads=FFMPEG_THREADS,
                    crf=28
                )
            
            commands.append((output, i, rendition))
            
        except Exception as e:
            logger.error(f"Error building fast command for rendition {rendition['name']}: {e}")
            continue
    
    return commands

def _run_ffmpeg_commands_fast(commands: List[tuple], timeout: int) -> bool:
    """Быстрый запуск ffmpeg команд последовательно"""
    try:
        for command, index, rendition in commands:
            logger.info(f"Running fast ffmpeg command {index+1}/{len(commands)} for {rendition['name']}")
            
            # Упрощенный запуск без лишнего логгирования
            ffmpeg.run(command, overwrite_output=True, quiet=True)
            
            logger.info(f"Fast ffmpeg command completed for {rendition['name']}")
        
        return True
    except Exception as e:
        logger.error(f"Error running fast ffmpeg commands: {e}")
        return False

def _create_master_playlist(output_dir: str, renditions: List[Dict[str, Any]]):
    """Создает мастер плейлист для всех рендитций"""
    master_playlist_path = os.path.join(output_dir, "master.m3u8")
    
    with open(master_playlist_path, 'w') as f:
        f.write("#EXTM3U\n")
        f.write("#EXT-X-VERSION:3\n")
        
        for i, rendition in enumerate(renditions):
            # Рассчитываем полосу пропускания
            bandwidth = int(rendition['video_bitrate'].replace('k', '')) * 1000
            if 'audio_bitrate' in rendition:
                bandwidth += int(rendition['audio_bitrate'].replace('k', '')) * 1000
            
            resolution = f"640x{rendition['height']}"  # Примерная ширина
            f.write(f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={resolution}\n")
            f.write(f"stream_{i}/playlist.m3u8\n")

def _upload_to_s3_complete(local_dir: str, s3_base_path: str, file_id: str):
    """Полная загрузка всех рендитций в S3"""
    logger.info(f"Complete uploading to S3 path {s3_base_path} for file ID: {file_id}")
    s3_hls_path = f"{s3_base_path}/hls"

    master_playlist_local = os.path.join(local_dir, "master.m3u8")
    if os.path.exists(master_playlist_local):
        s3_key_master = f"{s3_hls_path}/master.m3u8"
        s3_client.upload_file(master_playlist_local, settings.AWS_S3_BUCKET_NAME, s3_key_master)

    # Загружаем все рендитции
    for item in os.listdir(local_dir):
        item_path = os.path.join(local_dir, item)
        if os.path.isdir(item_path) and item.startswith("stream_"):
            logger.info(f"Uploading rendition directory {item} to S3")
            for filename in os.listdir(item_path):
                local_file_path = os.path.join(item_path, filename)
                if os.path.isfile(local_file_path):
                    s3_key = f"{s3_hls_path}/{item}/{filename}"
                    s3_client.upload_file(local_file_path, settings.AWS_S3_BUCKET_NAME, s3_key)

def _transcode_video_task_internal(file_id: str):
    """Внутренняя функция, выполняющая фактическое транскодирование."""
    logger.info(f"[Worker Thread] Fast transcoding task started for file ID: {file_id}")
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

            # Все рендитции
            renditions = _get_all_renditions()
            
            has_audio = _probe_audio_streams(original_local_path)
            logger.info(f"[Worker Thread] Audio streams detected: {has_audio}")

            timeout = _calculate_timeout(original_local_path)
            
            # Попытка copy transcode (самый быстрый способ)
            if USE_COPY_CODEC:
                can_copy, video_codec, audio_codec = _can_copy_codec(original_local_path)
                logger.info(f"Copy codec capability: {can_copy}, Video: {video_codec}, Audio: {audio_codec}")
                
                if can_copy and _try_copy_transcode_all(original_local_path, output_dir, SEGMENT_DURATION, has_audio, renditions):
                    logger.info("Using copy transcode - fastest method for all renditions")
                    # Создаем мастер плейлист для всех рендитций
                    _create_master_playlist(output_dir, renditions)
                else:
                    # Быстрое перекодирование всех рендитций
                    commands = _build_fast_hls_commands(
                        original_local_path, output_dir, renditions, SEGMENT_DURATION, has_audio
                    )
                    
                    if commands and not _run_ffmpeg_commands_fast(commands, timeout):
                        raise Exception("Fast HLS transcoding failed")
                    
                    # Создаем мастер плейлист для всех рендитций
                    _create_master_playlist(output_dir, renditions)
            else:
                # Быстрое перекодирование всех рендитций
                commands = _build_fast_hls_commands(
                    original_local_path, output_dir, renditions, SEGMENT_DURATION, has_audio
                )
                
                if commands and not _run_ffmpeg_commands_fast(commands, timeout):
                    raise Exception("Fast HLS transcoding failed")
                
                # Создаем мастер плейлист для всех рендитций
                _create_master_playlist(output_dir, renditions)

            base_s3_path = f"transcoded/{file_record.id}"
            _upload_to_s3_complete(os.path.join(temp_dir, "output", "hls"), base_s3_path, file_id)

            logger.info(f"[Worker Thread] Setting transcoding status to 'completed' for file ID: {file_id}")
            file_record.hls_manifest_path = f"{base_s3_path}/hls/master.m3u8"
            file_record.transcoding_status = "completed"
            logger.info(f"[Worker Thread] Fast transcoding completed successfully for file {file_id}")

    except Exception as e:
        logger.error(f"[Worker Thread] Error during fast transcoding for file {file_id}: {e}", exc_info=True)
        try:
            with get_db_session() as db_fail:
                file_record_fail = db_fail.query(File).filter(File.id == file_id).first()
                if file_record_fail:
                    logger.info(f"[Worker Thread] Updating transcoding status to 'failed' for file ID: {file_id}")
                    file_record_fail.transcoding_status = "failed"
        except Exception as db_error:
            logger.error(f"[Worker Thread] Error updating DB status to 'failed' for file {file_id}: {db_error}")
    finally:
        if temp_dir and os.path.exists(temp_dir):
            logger.info(f"[Worker Thread] Cleaning up temporary files for file ID: {file_id} (path: {temp_dir})")
            shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info(f"[Worker Thread] Fast transcoding task finished for file ID: {file_id}")

def start_transcoding(file_id: str):
    """Запуск задачи транскодирования через пул потоков."""
    logger.info(f"Scheduling fast transcoding task for file ID: {file_id}")
    future = executor.submit(_transcode_video_task_internal, file_id)
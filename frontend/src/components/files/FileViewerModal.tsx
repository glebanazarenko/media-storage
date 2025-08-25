import React, { useEffect, useRef, useState } from 'react';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Play, Pause, Volume2, VolumeX, Maximize, Minimize, Repeat } from 'lucide-react';
import { FileItem } from '../../types';
import { filesAPI, API_BASE_URL } from '../../services/api';

interface FileViewerModalProps {
  file: FileItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  file,
  onClose,
  onPrev,
  onNext,
  hasNext,
  hasPrev
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Панорамирование — только для изображений
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Touch события для мобильных устройств
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; distance: number } | null>(null);
  const [touchPanOffset, setTouchPanOffset] = useState({ x: 0, y: 0 });

  // Для свайпов в полноэкранном режиме
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [swipeStartZone, setSwipeStartZone] = useState<'left' | 'right' | null>(null);

  // Для видео
  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPanOffset, setVideoPanOffset] = useState({ x: 0, y: 0 });
  const [videoRotation, setVideoRotation] = useState(0);
  const [isVideoPanning, setIsVideoPanning] = useState(false);
  const [videoPanStart, setVideoPanStart] = useState({ x: 0, y: 0 });
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isRepeat, setIsRepeat] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaNatural, setMediaNatural] = useState({ width: 800, height: 600 });
  const [videoNatural, setVideoNatural] = useState({ width: 800, height: 450 });

  // Для двойного клика
  const [lastClickTime, setLastClickTime] = useState(0);
  const [lastClickPosition, setLastClickPosition] = useState({ x: 0, y: 0 });

  const isImage = file.mime_type.startsWith('image/');
  const isVideo = file.mime_type.startsWith('video/');
  const isAudio = file.mime_type.startsWith('audio/');

  const getFileUrl = () => `${API_BASE_URL}/files/${file.id}/stream`;

  // Функция для обрезки текста
  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Читаем размеры медиа (нативные)
  useEffect(() => {
    if (isImage) {
      const img = new Image();
      img.onload = () => setMediaNatural({ width: img.width, height: img.height });
      img.src = getFileUrl();
    } else if (isVideo) {
      const v = document.createElement('video');
      v.onloadedmetadata = () => {
        setVideoNatural({ width: v.videoWidth, height: v.videoHeight });
        setMediaNatural({ width: v.videoWidth, height: v.videoHeight });
      };
      v.src = getFileUrl();
    } else if (isAudio) {
      setMediaNatural({ width: 600, height: 300 });
    } else {
      setMediaNatural({ width: 800, height: 600 });
    }
  }, [file.id, file.mime_type]);

  // Сброс вида при смене файла
  useEffect(() => {
    resetView();
  }, [file.id]);

  // Видео события
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      if (isRepeat) {
        video.currentTime = 0;
        video.play();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [file.id, isRepeat]);

  // Функция для полноэкранного режима
  const toggleFullscreen = () => {
    if (!fullscreenContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        if (fullscreenContainerRef.current.requestFullscreen) {
          fullscreenContainerRef.current.requestFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  // Обработчик изменения полноэкранного режима
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Клавиатура
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','a','d','A','D','ф','Ф','в','В'].includes(e.key)) e.preventDefault();
      if (e.key === 'Escape') {
        if (isFullscreen) {
          toggleFullscreen();
        } else {
          onClose();
        }
      }
      if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a' || e.key === 'ф') && hasPrev && onPrev) onPrev();
      if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'd' || e.key === 'в') && hasNext && onNext) onNext();

      // Увеличение/уменьшение — только для изображений и видео
      if (isImage || isVideo) {
        if (e.key === '+' || e.key === '=' || e.key === ']') {
          if (isImage) setZoom(z => Math.min(z * 1.2, 5));
          if (isVideo) setVideoZoom(z => Math.min(z * 1.2, 5));
        }
        if (e.key === '-' || e.key === '_' || e.key === '[') {
          if (isImage) setZoom(z => Math.max(z / 1.2, 0.2));
          if (isVideo) setVideoZoom(z => Math.max(z / 1.2, 0.2));
        }
        if (e.key.toLowerCase() === 'r' || e.key === 'к' || e.key === 'К') {
          if (isImage) setRotation(r => (r + 90) % 360);
          if (isVideo) setVideoRotation(r => (r + 90) % 360);
        }
        // Сброс вида по Q или Й
        if (e.key.toLowerCase() === 'q' || e.key === 'й' || e.key === 'Й') {
          e.preventDefault();
          resetView();
        }
      }

      // Управление видео
      if (isVideo) {
        if (e.key === ' ') {
          e.preventDefault();
          togglePlay();
        }
        if (e.key === 'm' || e.key === 'ь') {
          toggleMute();
        }
        if (e.key === 'l' || e.key === 'д') {
          toggleRepeat();
        }
      }

      // Полноэкранный режим
      if (e.key.toLowerCase() === 'f' || e.key === 'а' || e.key === 'F' || e.key === 'А') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext, hasNext, hasPrev, isImage, isVideo, isFullscreen]);

  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
    setTouchPanOffset({ x: 0, y: 0 });
    setVideoZoom(1);
    setVideoPanOffset({ x: 0, y: 0 });
    setVideoRotation(0);
  };

  // Панорамирование — только для изображений
  const onMouseDown = (e: React.MouseEvent) => {
    if (!isImage) return;
    // игнор кликов по контролам
    if ((e.target as HTMLElement).closest('.control-button') || (e.target as HTMLElement).closest('.video-controls')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  
  // Обработчик двойного клика
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Если это видео, переключаем полноэкранный режим
    if (isVideo) {
      toggleFullscreen();
    } else {
      // Для других типов файлов - обычный fullscreen
      toggleFullscreen();
    }
  };

  // Обработчик одиночного клика для определения двойного клика
  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const clickPosition = { x: e.clientX, y: e.clientY };
    
    // Проверяем, является ли это двойным кликом (время между кликами < 300ms и позиция близкая)
    if (now - lastClickTime < 300 && 
        Math.abs(clickPosition.x - lastClickPosition.x) < 10 && 
        Math.abs(clickPosition.y - lastClickPosition.y) < 10) {
      handleDoubleClick(e);
      setLastClickTime(0); // Сбрасываем для предотвращения тройного клика
    } else {
      setLastClickTime(now);
      setLastClickPosition(clickPosition);
    }
  };

  // Обработчик колесика мыши (только для зума)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Предотвращаем прокрутку фона
    if (isImage) {
      setZoom(z => (e.deltaY < 0 ? Math.min(z * 1.2, 5) : Math.max(z / 1.2, 0.2)));
    } else if (isVideo) {
      setVideoZoom(z => (e.deltaY < 0 ? Math.min(z * 1.2, 5) : Math.max(z / 1.2, 0.2)));
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isImage) return;
    if (isPanning) {
      e.preventDefault();
      e.stopPropagation(); // Предотвращаем прокрутку фона
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };
  const onMouseUp = () => setIsPanning(false);

  // Touch события для мобильных устройств
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isImage || e.touches.length === 0) return;
    
    if (e.touches.length === 1) {
      // Один палец - панорамирование
      setIsPanning(true);
      setPanStart({ 
        x: e.touches[0].clientX - panOffset.x - touchPanOffset.x, 
        y: e.touches[0].clientY - panOffset.y - touchPanOffset.y 
      });
    } else if (e.touches.length === 2) {
      // Два пальца - зум
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      setTouchStart({ 
        x: (touch1.clientX + touch2.clientX) / 2, 
        y: (touch1.clientY + touch2.clientY) / 2, 
        distance 
      });
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isImage) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 1 && isPanning) {
      // Панорамирование одним пальцем
      setPanOffset({ 
        x: e.touches[0].clientX - panStart.x, 
        y: e.touches[0].clientY - panStart.y 
      });
    } else if (e.touches.length === 2 && touchStart) {
      // Зум двумя пальцами с уменьшенной чувствительностью
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // Уменьшаем чувствительность зума в 6 раз (2 * 3)
      const scale = (distance / touchStart.distance) * 0.167 + 0.833;
      const newZoom = Math.max(0.2, Math.min(5, zoom * scale));
      setZoom(newZoom);
      
      // Панорамирование при зуме с уменьшенной чувствительностью в 9 раз (3 * 3)
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      setTouchPanOffset({
        x: (centerX - touchStart.x) * 0.1, // Уменьшаем чувствительность панорамирования в 9 раз
        y: (centerY - touchStart.y) * 0.1
      });
    }
  };

  const onTouchEnd = () => {
    setIsPanning(false);
    setTouchStart(null);
  };

  // Обработчики свайпов в полноэкранном режиме
  const handleFullscreenTouchStart = (e: React.TouchEvent) => {
    if (!isFullscreen) return;
    
    const touchX = e.targetTouches[0].clientX;
    const screenWidth = window.innerWidth;
    const zoneWidth = screenWidth * 0.2; // 20% экрана
    
    // Определяем зону начала свайпа
    if (touchX <= zoneWidth) {
      setSwipeStartZone('left');
    } else if (touchX >= screenWidth - zoneWidth) {
      setSwipeStartZone('right');
    } else {
      setSwipeStartZone(null);
    }
    
    setTouchStartX(touchX);
  };

  const handleFullscreenTouchMove = (e: React.TouchEvent) => {
    if (!isFullscreen) return;
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleFullscreenTouchEnd = () => {
    if (!isFullscreen || !swipeStartZone) return;
    
    const swipeThreshold = 50; // Минимальная дистанция свайпа в пикселях
    const deltaX = touchEndX - touchStartX;
    
    if (swipeStartZone === 'left' && deltaX < swipeThreshold) {
      // Свайп вправо из левой зоны - предыдущий файл
      if (hasPrev && onPrev) {
        onPrev();
      }
    } else if (swipeStartZone === 'right' && deltaX < -swipeThreshold) {
      // Свайп влево из правой зоны - следующий файл
      if (hasNext && onNext) {
        onNext();
      }
    }
    
    // Сбрасываем зону
    setSwipeStartZone(null);
  };

  // Панорамирование для видео
  const onVideoMouseDown = (e: React.MouseEvent) => {
    if (!isVideo) return;
    if ((e.target as HTMLElement).closest('.control-button') || (e.target as HTMLElement).closest('.video-controls')) return;
    setIsVideoPanning(true);
    setVideoPanStart({ x: e.clientX - videoPanOffset.x, y: e.clientY - videoPanOffset.y });
  };
  const onVideoMouseMove = (e: MouseEvent) => {
    if (!isVideo || !isVideoPanning) return;
    e.preventDefault();
    e.stopPropagation(); // Предотвращаем прокрутку фона
    setVideoPanOffset({ x: e.clientX - videoPanStart.x, y: e.clientY - videoPanStart.y });
  };
  const onVideoMouseUp = () => setIsVideoPanning(false);

  useEffect(() => {
    if (isPanning) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isPanning, panStart]);

  useEffect(() => {
    if (isVideoPanning) {
      document.addEventListener('mousemove', onVideoMouseMove);
      document.addEventListener('mouseup', onVideoMouseUp);
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', onVideoMouseMove);
      document.removeEventListener('mouseup', onVideoMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isVideoPanning, videoPanStart]);

  // Видео управление
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const toggleRepeat = () => {
    if (videoRef.current) {
      setIsRepeat(!isRepeat);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
      setIsMuted(newVolume === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    filesAPI.downloadFile(file.id);
  };

  // Размеры для модального окна (увеличенные)
  const modalBoxStyle: React.CSSProperties = {
    width: 'min(98vw, 1400px)',
    height: 'min(95vh, 950px)',
  };

  const fullscreenStyle: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
  };

  // Блокируем прокрутку страницы при открытии модального окна
  useEffect(() => {
    const body = document.body;
    const originalOverflow = body.style.overflow;
    
    // Блокируем прокрутку
    body.style.overflow = 'hidden';
    
    return () => {
      // Возвращаем оригинальное состояние
      body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { 
        if (e.target === modalRef.current) onClose(); 
      }}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Стрелки навигации */}
      {hasPrev && onPrev && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-10 control-button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onPrev(); 
          }}
        >
          <ChevronLeft className="w-12 h-12" />
        </button>
      )}
      {hasNext && onNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-10 control-button"
          onClick={(e) => { 
            e.stopPropagation(); 
            onNext(); 
          }}
        >
          <ChevronRight className="w-12 h-12" />
        </button>
      )}

      {/* Коробка: сетка [header | content | footer] */}
      <div
        ref={fullscreenContainerRef}
        className={`relative bg-black rounded-lg shadow-2xl overflow-hidden ${
          isFullscreen ? 'fixed inset-0 rounded-none m-0' : ''
        } grid`}
        style={{
          ...(isFullscreen ? fullscreenStyle : modalBoxStyle),
          gridTemplateRows: isFullscreen ? '1fr' : '60px 1fr 80px'
        }}
        onMouseDown={isImage ? onMouseDown : isVideo ? onVideoMouseDown : undefined}
        onMouseMove={isImage ? onMouseMove : isVideo ? onVideoMouseMove : undefined}
        onMouseUp={isImage ? onMouseUp : isVideo ? onVideoMouseUp : undefined}
        onWheel={onWheel}
        onTouchStart={(e) => {
          if (isImage || isVideo) {
            if (isImage) {
              onTouchStart(e);
            }
            if (isFullscreen) {
              handleFullscreenTouchStart(e);
            }
          }
        }}
        onTouchMove={(e) => {
          if (isImage || isVideo) {
            if (isImage) {
              onTouchMove(e);
            }
            if (isFullscreen) {
              handleFullscreenTouchMove(e);
            }
          }
        }}
        onTouchEnd={(e) => {
          if (isImage || isVideo) {
            if (isImage) {
              onTouchEnd();
            }
            if (isFullscreen) {
              handleFullscreenTouchEnd();
            }
          }
        }}
        onClick={isImage ? handleClick : isVideo ? handleClick : undefined}
      >
        {/* Header - скрываем в полноэкранном режиме */}
        {!isFullscreen && (
          <div className="flex justify-between items-center p-3 bg-gray-900/80 backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold truncate text-white" title={file.filename}>
                {truncateText(file.filename, 7)}
              </h2>
              <p className="text-xs text-gray-300 truncate">
                {file.category_name} • {formatFileSize(file.file_size)}
              </p>
            </div>

            <div className="flex items-center space-x-1 ml-2">
              {/* Зум/ротация показываем только для изображений и видео */}
              {(isImage || isVideo) && (
                <>
                  <button
                    className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (isImage) setZoom(z => Math.max(z / 1.2, 0.2));
                      if (isVideo) setVideoZoom(z => Math.max(z / 1.2, 0.2));
                    }}
                    title="Zoom Out (-, [, колесо)"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-white text-xs min-w-[30px] text-center">
                    {Math.round((isImage ? zoom : isVideo ? videoZoom : 1) * 100)}%
                  </span>
                  <button
                    className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (isImage) setZoom(z => Math.min(z * 1.2, 5));
                      if (isVideo) setVideoZoom(z => Math.min(z * 1.2, 5));
                    }}
                    title="Zoom In (+, ], колесо)"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (isImage) setRotation(r => (r + 90) % 360);
                      if (isVideo) setVideoRotation(r => (r + 90) % 360);
                    }}
                    title="Rotate (R)"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button
                    className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                    onClick={(e) => { e.stopPropagation(); resetView(); }}
                    title="Reset View (Q, Й)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </>
              )}

              <button
                className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
              <button
                className="control-button p-1.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Контент (медиа) */}
        <div
          ref={mediaRef}
          className="relative overflow-hidden bg-black flex items-center justify-center"
          style={{ 
            cursor: isImage ? (isPanning ? 'grabbing' : 'grab') : 
                     isVideo ? (isVideoPanning ? 'grabbing' : 'grab') : 'default'
          }}
        >
          {isImage && (
            <div
              ref={imageContainerRef}
              className="will-change-transform flex items-center justify-center w-full h-full touch-none"
              style={{
                transform: `translate(${panOffset.x + touchPanOffset.x}px, ${panOffset.y + touchPanOffset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transition: isPanning ? 'none' : 'transform 0.15s ease'
              }}
            >
              <img
                src={getFileUrl()}
                alt={file.filename}
                draggable={false}
                className="select-none max-w-none max-h-none"
                style={{ 
                  width: `${mediaNatural.width}px`, 
                  height: `${mediaNatural.height}px`,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain'
                }}
              />
            </div>
          )}

          {isVideo && (
            <div className="relative w-full h-full flex flex-col">
              <div 
                ref={videoContainerRef}
                className="flex-1 flex items-center justify-center overflow-hidden"
              >
                <div
                  className="will-change-transform flex items-center justify-center w-full h-full"
                  style={{
                    transform: `translate(${videoPanOffset.x}px, ${videoPanOffset.y}px) scale(${videoZoom}) rotate(${videoRotation}deg)`,
                    transition: isVideoPanning ? 'none' : 'transform 0.15s ease',
                  }}
                >
                  <video
                    ref={videoRef}
                    src={getFileUrl()}
                    autoPlay
                    muted={isMuted}
                    volume={volume}
                    className="block max-w-none max-h-none"
                    style={{
                      width: `${videoNatural.width}px`,
                      height: `${videoNatural.height}px`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                    preload="metadata"
                    playsInline
                  />
                </div>
              </div>
              
              {/* Видео контролы - скрываем в полноэкранном режиме при наведении */}
              <div className={`video-controls bg-gray-900/90 backdrop-blur-sm p-2 flex items-center space-x-2 transition-opacity duration-300 ${
                isFullscreen ? 'opacity-0 hover:opacity-100' : ''
              }`}>
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="control-button text-white hover:text-gray-300 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                
                <div className="flex-1 flex items-center space-x-2">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-white text-xs min-w-[60px]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    className="control-button text-white hover:text-gray-300 transition-colors"
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                
                {/* Кнопка повтора */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
                  className={`control-button text-white hover:text-gray-300 transition-colors ${
                    isRepeat ? 'text-purple-500' : ''
                  }`}
                  title={isRepeat ? 'Disable Repeat' : 'Enable Repeat'}
                >
                  <Repeat className={`w-4 h-4 ${isRepeat ? 'fill-current' : ''}`} />
                </button>
                
                {/* Кнопка полноэкранного режима в контролах */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                  className="control-button text-white hover:text-gray-300 transition-colors"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {isAudio && (
            <div className="w-full h-full flex flex-col items-center justify-center p-6">
              <div className="bg-gray-800 rounded-full p-6 mb-4">
                <div className="bg-gray-600 rounded-full p-4">
                  <div className="bg-gray-400 rounded-full p-3">
                    <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center">
                      <div className="w-8 h-8 bg-white rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
              <audio src={getFileUrl()} controls autoPlay className="w-full max-w-md" />
            </div>
          )}

          {!isImage && !isVideo && !isAudio && (
            <div className="text-center text-white p-6">
              <div className="text-4xl mb-3">📄</div>
              <p className="text-lg mb-3">File type not supported for preview</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors text-base flex items-center mx-auto"
              >
                <Download className="w-4 h-4 mr-1" />
                Download File
              </button>
            </div>
          )}
        </div>

        {/* Footer - скрываем в полноэкранном режиме */}
        {!isFullscreen && (
          <div className="p-3 bg-gray-900/80 backdrop-blur-sm">
            <div className="h-full flex flex-col">
              {(file.description || (file.tags && file.tags.length > 0)) ? (
                <>
                  {file.description && (
                    <div className="mb-2 text-white text-sm" title={file.description}>
                      {truncateText(file.description, 100)}
                    </div>
                  )}
                  {file.tags && file.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 flex-1">
                      {file.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag.id}
                          className="px-2 py-0.5 bg-purple-600/80 text-white text-xs rounded-full truncate max-w-[80px] max-h-[30px]"
                          title={tag.name}
                        >
                          {truncateText(tag.name, 10)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-gray-400 flex items-center h-full">Нет описания или тегов</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
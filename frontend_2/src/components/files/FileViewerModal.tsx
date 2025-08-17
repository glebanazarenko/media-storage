import React, { useEffect, useRef, useState } from 'react';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { FileItem } from '../../types';

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

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Панорамирование — только для изображений
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

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

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaNatural, setMediaNatural] = useState({ width: 800, height: 600 });
  const [videoNatural, setVideoNatural] = useState({ width: 800, height: 450 });

  const isImage = file.mime_type.startsWith('image/');
  const isVideo = file.mime_type.startsWith('video/');
  const isAudio = file.mime_type.startsWith('audio/');

  const getFileUrl = () => `http://localhost:8000/files/${file.id}/stream`;

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
    setZoom(1);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
    setVideoZoom(1);
    setVideoPanOffset({ x: 0, y: 0 });
    setVideoRotation(0);
    setIsPlaying(true);
    setIsMuted(false);
    setVolume(1);
  }, [file.id]);

  // Видео события
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [file.id]);

  // Клавиатура
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','a','d','A','D','ф','Ф','в','В'].includes(e.key)) e.preventDefault();
      if (e.key === 'Escape') onClose();
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext, hasNext, hasPrev, isImage, isVideo]);

  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
    setVideoZoom(1);
    setVideoPanOffset({ x: 0, y: 0 });
    setVideoRotation(0);
  };

  // Панорамирование — только для изображений
  const onMouseDown = (e: React.MouseEvent) => {
    if (!isImage) return;
    // игнор кликов по контролам
    if ((e.target as HTMLElement).closest('.control-button')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!isImage) return;
    if (isPanning) setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const onMouseUp = () => setIsPanning(false);

  // Панорамирование для видео
  const onVideoMouseDown = (e: React.MouseEvent) => {
    if (!isVideo) return;
    if ((e.target as HTMLElement).closest('.control-button') || (e.target as HTMLElement).closest('.video-controls')) return;
    setIsVideoPanning(true);
    setVideoPanStart({ x: e.clientX - videoPanOffset.x, y: e.clientY - videoPanOffset.y });
  };
  const onVideoMouseMove = (e: MouseEvent) => {
    if (!isVideo || !isVideoPanning) return;
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

  // Колесо — зум только для изображений и видео
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isImage) {
      setZoom(z => (e.deltaY < 0 ? Math.min(z * 1.2, 5) : Math.max(z / 1.2, 0.2)));
    } else if (isVideo) {
      setVideoZoom(z => (e.deltaY < 0 ? Math.min(z * 1.2, 5) : Math.max(z / 1.2, 0.2)));
    }
  };

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

  // Размер модалки фиксирован относительно вьюпорта — шапка/подвал не режутся
  const modalBoxStyle: React.CSSProperties = {
    width: isFullscreen ? '100vw' : 'min(96vw, 1280px)',
    height: isFullscreen ? '100vh' : 'min(92vh, 900px)',
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === modalRef.current) onClose(); }}
    >
      {/* Стрелки навигации */}
      {hasPrev && onPrev && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-10 control-button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
        >
          <ChevronLeft className="w-12 h-12" />
        </button>
      )}
      {hasNext && onNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-10 control-button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
        >
          <ChevronRight className="w-12 h-12" />
        </button>
      )}

      {/* Коробка: сетка [header | content | footer] */}
      <div
        className={`relative bg-black rounded-lg shadow-2xl overflow-hidden ${
          isFullscreen ? 'fixed inset-0 rounded-none m-0' : ''
        } grid`}
        style={{
          ...modalBoxStyle,
          gridTemplateRows: 'auto 1fr auto'
        }}
        onMouseDown={isImage ? onMouseDown : isVideo ? onVideoMouseDown : undefined}
        onWheel={onWheel}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-gray-900/80 backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold truncate text-white">{file.filename}</h2>
            <p className="text-sm text-gray-300">{file.category_name} • {file.file_size} bytes</p>
          </div>

          <div className="flex items-center space-x-2 ml-4">
            {/* Зум/ротация показываем только для изображений и видео */}
            {(isImage || isVideo) && (
              <>
                <button
                  className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (isImage) setZoom(z => Math.max(z / 1.2, 0.2));
                    if (isVideo) setVideoZoom(z => Math.max(z / 1.2, 0.2));
                  }}
                  title="Zoom Out (-, [, колесо)"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <span className="text-white text-sm min-w-[40px] text-center">
                  {Math.round((isImage ? zoom : isVideo ? videoZoom : 1) * 100)}%
                </span>
                <button
                  className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (isImage) setZoom(z => Math.min(z * 1.2, 5));
                    if (isVideo) setVideoZoom(z => Math.min(z * 1.2, 5));
                  }}
                  title="Zoom In (+, ], колесо)"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button
                  className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (isImage) setRotation(r => (r + 90) % 360);
                    if (isVideo) setVideoRotation(r => (r + 90) % 360);
                  }}
                  title="Rotate (R)"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
                <button
                  className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                  onClick={(e) => { e.stopPropagation(); resetView(); }}
                  title="Reset View"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </>
            )}

            <button
              className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); window.open(`http://localhost:8000/files/${file.id}/download`, '_blank'); }}
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); setIsFullscreen(v => !v); }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              <Maximize className="w-5 h-5" />
            </button>
            <button
              className="control-button p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

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
              className="will-change-transform"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transition: isPanning ? 'none' : 'transform 0.15s ease'
              }}
            >
              <img
                src={getFileUrl()}
                alt={file.filename}
                draggable={false}
                className="select-none max-w-none max-h-none"
                style={{ width: `${mediaNatural.width}px`, height: `${mediaNatural.height}px` }}
              />
            </div>
          )}

          {isVideo && (
            <div className="relative w-full h-full flex flex-col">
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div
                  className="will-change-transform"
                  style={{
                    transform: `translate(${videoPanOffset.x}px, ${videoPanOffset.y}px) scale(${videoZoom}) rotate(${videoRotation}deg)`,
                    transition: isVideoPanning ? 'none' : 'transform 0.15s ease',
                    width: videoNatural.width,
                    height: videoNatural.height,
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
                      objectFit: 'none',
                    }}
                  />
                </div>
              </div>
              
              {/* Видео контролы */}
              <div className="video-controls bg-gray-900/90 backdrop-blur-sm p-3 flex items-center space-x-3">
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="control-button text-white hover:text-gray-300 transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
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
                  <span className="text-white text-sm min-w-[80px]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    className="control-button text-white hover:text-gray-300 transition-colors"
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            </div>
          )}

          {isAudio && (
            <div className="w-full h-full flex flex-col items-center justify-center p-8">
              <div className="bg-gray-800 rounded-full p-8 mb-6">
                <div className="bg-gray-600 rounded-full p-6">
                  <div className="bg-gray-400 rounded-full p-4">
                    <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center">
                      <div className="w-10 h-10 bg-white rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
              <audio src={getFileUrl()} controls autoPlay className="w-full max-w-md" />
            </div>
          )}

          {!isImage && !isVideo && !isAudio && (
            <div className="text-center text-white p-8">
              <div className="text-6xl mb-4">📄</div>
              <p className="text-xl mb-4">File type not supported for preview</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`http://localhost:8000/files/${file.id}/download`, '_blank');
                }}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg transition-colors text-lg flex items-center mx-auto"
              >
                <Download className="w-5 h-5 mr-2" />
                Download File
              </button>
            </div>
          )}
        </div>

        {/* Footer (описание/теги) */}
        <div className="p-4 bg-gray-900/80 backdrop-blur-sm">
          {(file.description || (file.tags && file.tags.length > 0)) ? (
            <>
              {file.description && (
                <div className="mb-3 text-white">
                  <p>{file.description}</p>
                </div>
              )}
              {file.tags && file.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {file.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-3 py-1 bg-purple-600/80 text-white text-sm rounded-full"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400">Нет описания или тегов</div>
          )}
        </div>
      </div>
    </div>
  );
};
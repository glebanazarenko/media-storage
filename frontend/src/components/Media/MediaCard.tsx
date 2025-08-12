import React, { useState, useRef } from 'react';
import { Play, Download, Edit3, Trash2, Share2, Eye, EyeOff, MoreVertical } from 'lucide-react';
import { MediaFile } from '../../types';
import { RatingBadge } from './RatingBadge';
import { TagList } from './TagList';

interface MediaCardProps {
  file: MediaFile;
  selected?: boolean;
  onSelect?: () => void;
  onAction?: (action: string) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ 
  file, 
  selected = false, 
  onSelect, 
  onAction 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isBlurred, setIsBlurred] = useState(file.rating === '18+' || file.rating === '16+');
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = file.mimeType.startsWith('video/');
  const isImage = file.mimeType.startsWith('image/');

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (isVideo && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Handle autoplay restrictions
      });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const toggleBlur = () => {
    setIsBlurred(!isBlurred);
  };

  const thumbnailUrl = file.thumbnailPath || `https://images.pexels.com/photos/${Math.floor(Math.random() * 1000) + 1}/pexels-photo-${Math.floor(Math.random() * 1000) + 1}.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop`;

  return (
    <div
      className={`group relative bg-gray-800 rounded-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-105 ${
        selected ? 'ring-2 ring-blue-500' : ''
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Selection Checkbox */}
      <div className="absolute top-2 left-2 z-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
        />
      </div>

      {/* Rating Badge */}
      <div className="absolute top-2 right-2 z-10">
        <RatingBadge rating={file.rating} />
      </div>

      {/* Media Content */}
      <div className="relative aspect-square overflow-hidden">
        {isVideo ? (
          <>
            {/* Video Thumbnail */}
            <img
              src={thumbnailUrl}
              alt={file.originalName}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isHovered ? 'opacity-0' : 'opacity-100'
              } ${isBlurred ? 'blur-md' : ''}`}
              onLoad={() => setImageLoaded(true)}
            />
            
            {/* Video Preview */}
            <video
              ref={videoRef}
              src={file.previewPath || file.path}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isHovered ? 'opacity-100' : 'opacity-0'
              } ${isBlurred ? 'blur-md' : ''}`}
              muted
              loop
              playsInline
            />

            {/* Play Button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`bg-black bg-opacity-50 rounded-full p-3 transition-opacity duration-300 ${
                isHovered ? 'opacity-0' : 'opacity-100'
              }`}>
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>

            {/* Duration Badge */}
            {file.duration && (
              <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                {formatDuration(file.duration)}
              </div>
            )}
          </>
        ) : (
          <img
            src={thumbnailUrl}
            alt={file.originalName}
            className={`w-full h-full object-cover transition-all duration-300 ${
              isBlurred ? 'blur-md' : ''
            } ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
          />
        )}

        {/* Blur Toggle Button */}
        {(file.rating === '18+' || file.rating === '16+') && (
          <button
            onClick={toggleBlur}
            className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white p-1 rounded hover:bg-opacity-90 transition-opacity"
          >
            {isBlurred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}

        {/* Hover Actions */}
        <div className={`absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex space-x-2">
            <button
              onClick={() => onAction?.('view')}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white p-2 rounded-full transition-all"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => onAction?.('download')}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white p-2 rounded-full transition-all"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => onAction?.('share')}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white p-2 rounded-full transition-all"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* File Info */}
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-100 truncate flex-1 mr-2">
            {file.originalName}
          </h3>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-gray-400 hover:text-gray-300 p-1"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-700 rounded-lg shadow-lg py-1 z-20 min-w-[120px]">
                <button
                  onClick={() => onAction?.('edit')}
                  className="w-full px-3 py-2 text-left text-gray-300 hover:bg-gray-600 hover:text-white flex items-center space-x-2"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => onAction?.('delete')}
                  className="w-full px-3 py-2 text-left text-red-400 hover:bg-gray-600 hover:text-red-300 flex items-center space-x-2"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-2">
          {formatFileSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
        </div>

        {/* Tags */}
        <TagList tags={file.tags.slice(0, 3)} compact />
        
        {/* Description */}
        {file.description && (
          <p className="text-xs text-gray-400 mt-2 line-clamp-2">
            {file.description}
          </p>
        )}
      </div>
    </div>
  );
};
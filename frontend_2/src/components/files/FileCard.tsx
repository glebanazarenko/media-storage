import React, { useState } from 'react';
import { Play, Download, Edit, Trash2, Eye } from 'lucide-react';
import { FileItem } from '../../types';
import { useApp } from '../../contexts/AppContext';

interface FileCardProps {
  file: FileItem;
  onEdit?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onView?: (file: FileItem) => void;
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  onEdit,
  onDelete,
  onView,
}) => {
  const { blurAdultContent } = useApp();
  const [isHovered, setIsHovered] = useState(false);

  const isVideo = file.mime_type.startsWith('video/');
  const isImage = file.mime_type.startsWith('image/');
  // Проверяем, является ли файл 18+ по category_id или другому полю
  const isAdultContent = file.category_name === '18+' || file.category_name === '16+'; // Или используйте file.category_id если он так обозначен в данных
  // Применяем blur только если включено и контент для взрослых
  const shouldBlur = blurAdultContent && isAdultContent;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div
      className="bg-slate-900 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] border border-slate-800"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thumbnail/Preview */}
      <div className="relative aspect-video bg-slate-800 overflow-hidden">
        {/* Category Badge */}
        <div className="absolute top-2 left-2 z-10">
          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
            file.category_name === '18+' ? 'bg-red-500 text-white' :
            file.category_name === '16+' ? 'bg-orange-500 text-white' :
            'bg-green-500 text-white'
          }`}>
            {file.category_name}
          </span>
        </div>

        {/* Thumbnail */}
        <div className={`w-full h-full flex items-center justify-center ${shouldBlur ? 'filter blur-lg' : ''}`}>
          {file.thumbnail_url ? (
            <img
              src={file.thumbnail_url}
              alt={file.filename}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-slate-700 flex items-center justify-center">
              <div className="text-slate-400 text-4xl">
                {isVideo ? '🎥' : isImage ? '🖼️' : '📄'}
              </div>
            </div>
          )}
        </div>

        {/* Video Play Button */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => onView?.(file)}
              className="bg-black/50 hover:bg-black/70 text-white rounded-full p-4 transition-all duration-200 transform hover:scale-110"
            >
              <Play className="w-8 h-8 fill-current" />
            </button>
          </div>
        )}

        {/* Hover Overlay */}
        {isHovered && !shouldBlur && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
            <div className="flex space-x-2">
              <button
                onClick={() => onView?.(file)}
                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-colors"
              >
                <Eye className="w-5 h-5" />
              </button>
              <button
                onClick={() => onEdit?.(file)}
                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-colors"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button
                onClick={() => window.open(`http://localhost:8000/files/${file.id}/download`, '_blank')}
                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full transition-colors"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => onDelete?.(file)}
                className="bg-red-500/20 hover:bg-red-500/30 text-white p-2 rounded-full transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Blur Overlay для взрослого контента */}
        {shouldBlur && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center text-white">
              <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm opacity-75">Adult Content</p>
            </div>
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="p-4">
        <h3 className="font-semibold text-white mb-2 truncate" title={file.filename}>
          {file.filename}
        </h3>

        {file.description && (
          <p className="text-slate-400 text-sm mb-3 line-clamp-2">
            {file.description}
          </p>
        )}

        {/* Tags */}
        {file.tags && file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {file.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/30"
              >
                {tag.name}
              </span>
            ))}
            {file.tags.length > 3 && (
              <span className="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded-full">
                +{file.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* File Details */}
        <div className="flex justify-between text-xs text-slate-500">
          <span>{formatFileSize(file.file_size)}</span>
          <span>{formatDate(file.created_at)}</span>
        </div>
      </div>
    </div>
  );
};
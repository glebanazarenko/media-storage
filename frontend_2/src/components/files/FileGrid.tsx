import React from 'react';
import { FileItem } from '../../types';
import { FileCard } from './FileCard';

interface FileGridProps {
  files: FileItem[];
  onEdit?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onView?: (file: FileItem) => void;
  loading?: boolean;
}

export const FileGrid: React.FC<FileGridProps> = ({
  files,
  onEdit,
  onDelete,
  onView,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <div className="aspect-video bg-slate-700"></div>
              <div className="p-4 space-y-3">
                <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                <div className="flex space-x-2">
                  <div className="h-6 bg-slate-700 rounded-full w-16"></div>
                  <div className="h-6 bg-slate-700 rounded-full w-20"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl">📁</span>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No files found</h3>
        <p className="text-slate-400 mb-6">Upload some files or adjust your filters to see content here.</p>
      </div>
    );
  }

  const handleFileEdit = (editedFile: FileItem) => {
    // Обновляем файл в списке
    onEdit?.(editedFile);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onEdit={handleFileEdit}
          onDelete={onDelete}
          onView={onView}
        />
      ))}
    </div>
  );
};
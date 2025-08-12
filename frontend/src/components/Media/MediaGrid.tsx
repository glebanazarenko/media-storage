import React, { useState, useRef, useEffect } from 'react';
import { MediaFile } from '../../types';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  files: MediaFile[];
  loading?: boolean;
  onFileSelect?: (file: MediaFile) => void;
  onFileAction?: (file: MediaFile, action: string) => void;
}

export const MediaGrid: React.FC<MediaGridProps> = ({ 
  files, 
  loading = false,
  onFileSelect,
  onFileAction 
}) => {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [columnsCount, setColumnsCount] = useState(4);
  const gridRef = useRef<HTMLDivElement>(null);

  // Calculate optimal column count based on container width
  useEffect(() => {
    const updateColumns = () => {
      if (gridRef.current) {
        const width = gridRef.current.offsetWidth;
        if (width < 640) setColumnsCount(2);
        else if (width < 1024) setColumnsCount(3);
        else if (width < 1536) setColumnsCount(4);
        else setColumnsCount(5);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const handleFileSelect = (file: MediaFile) => {
    const newSelected = new Set(selectedFiles);
    if (selectedFiles.has(file.id)) {
      newSelected.delete(file.id);
    } else {
      newSelected.add(file.id);
    }
    setSelectedFiles(newSelected);
    onFileSelect?.(file);
  };

  const handleFileAction = (file: MediaFile, action: string) => {
    onFileAction?.(file, action);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-gray-700 rounded-lg aspect-square"></div>
            <div className="mt-2 h-4 bg-gray-700 rounded w-3/4"></div>
            <div className="mt-1 h-3 bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-lg mb-4">No media files found</div>
        <p className="text-gray-500">Try adjusting your search filters or upload some files</p>
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
    >
      {files.map((file) => (
        <MediaCard
          key={file.id}
          file={file}
          selected={selectedFiles.has(file.id)}
          onSelect={() => handleFileSelect(file)}
          onAction={(action) => handleFileAction(file, action)}
        />
      ))}
    </div>
  );
};
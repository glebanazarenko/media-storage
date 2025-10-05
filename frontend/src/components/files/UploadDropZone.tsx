import React from 'react';
import { useTranslation } from 'react-i18next';
import { Upload as UploadIcon } from 'lucide-react';

interface UploadDropZoneProps {
  onFilesAdded: (files: File[]) => void;
}

export const UploadDropZone: React.FC<UploadDropZoneProps> = ({ onFilesAdded }) => {
  const { t } = useTranslation();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    onFilesAdded(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    onFilesAdded(droppedFiles);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center hover:border-purple-500 transition-colors duration-300 mb-6 bg-slate-900/50"
    >
      <UploadIcon className="w-16 h-16 text-slate-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-white mb-2">
        {t('file.dropHere')}
      </h3>
      <p className="text-slate-400 mb-4">
        {t('file.supportedTypes')}
      </p>
      <input
        type="file"
        multiple
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*"
        className="hidden"
        id="file-input"
      />
      <label
        htmlFor="file-input"
        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-lg cursor-pointer transition-all duration-300"
      >
        {t('file.selectFiles')}
      </label>
    </div>
  );
};
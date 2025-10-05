import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle } from 'lucide-react';

// Используем тот же интерфейс FileWithPreview
interface FileWithPreview extends File {
  id: string;
  preview?: string;
  originalFile: File;
}

interface FilePreviewListProps {
  files: FileWithPreview[];
  onRemove: (id: string) => void;
  uploading: boolean;
  uploadProgress: { [key: string]: number };
  getFileName: (file: File) => string;
  formatFileSize: (bytes: number) => string;
  getFileIcon: (file: File) => React.ReactNode;
  getEnhancedFileType: (file: File) => string;
}

export const FilePreviewList: React.FC<FilePreviewListProps> = ({
  files,
  onRemove,
  uploading,
  uploadProgress,
  getFileName,
  formatFileSize,
  getFileIcon,
  getEnhancedFileType,
}) => {
  const { t } = useTranslation();

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900 rounded-xl p-6 mb-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        {t('file.selectedFiles', { count: files.length })}
      </h3>
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {files.map((file) => {
          const fileName = getFileName(file);
          const progress = uploadProgress[file.id] ?? 0;
          const hasError = progress === -1;
          return (
            <div key={file.id} className="flex items-center justify-between bg-slate-800 p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                {file.preview ? (
                  <img
                    src={file.preview}
                    alt={fileName}
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
                    {getFileIcon(file)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-white font-medium truncate max-w-xs" title={fileName}>
                    {fileName}
                  </p>
                  <p className="text-slate-400 text-sm">{formatFileSize(file.size)}</p>
                  {uploading && progress >= 0 && (
                    <div className="w-full bg-slate-600 rounded-full h-2 mt-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  )}
                  {hasError && (
                    <p className="text-red-400 text-sm mt-1">{t('common.error')}</p>
                  )}
                </div>
              </div>
              {!uploading && (
                <button
                  onClick={() => onRemove(file.id)}
                  className="text-slate-400 hover:text-red-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, X, FileImage, FileVideo, FileAudio, FileText, FileArchive, AlertCircle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { TagInput } from '../components/files/TagInput';
import { filesAPI } from '../services/api';

// Расширяем интерфейс, чтобы сохранить все свойства File
interface FileWithPreview extends File {
  id: string;
  preview?: string;
  originalFile: File; // Сохраняем оригинальный файл
}

export const Upload: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState<'0+' | '16+' | '18+'>('0+');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Определяем операционную систему
  const isMac = useCallback(() => {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  }, []);

  // Добавляем обработчик событий клавиатуры
  useEffect(() => {
    let isMounted = true;
    
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Проверяем комбинацию Ctrl+V (Windows/Linux) или Cmd+V (Mac)
      const isPaste = (isMac() ? e.metaKey : e.ctrlKey) && (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М');
      
      if (isPaste) {
        e.preventDefault();
        if (isMounted) {
          await handlePasteFromClipboard();
        }
      }
    };

    // Добавляем слушатель событий
    window.addEventListener('keydown', handleKeyDown);
    
    // Убираем слушатель при размонтировании компонента
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMac]);

  // Функция для обработки вставки из буфера обмена
  const handlePasteFromClipboard = async () => {
    try {
      // Проверяем поддержку Clipboard API
      if (!navigator.clipboard || !navigator.clipboard.read) {
        // Пробуем прочитать текст из буфера обмена как альтернативу
        try {
          const text = await navigator.clipboard.readText();
          if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
            await handleMediaUrl(text);
            return;
          }
        } catch (error: any) {
          console.error('Error reading clipboard text:', error);
          setError(t('file.clipboardNotSupported'));
        }
        return;
      }

      // Читаем данные из буфера обмена
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        // Проверяем, есть ли изображение в буфере обмена
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            try {
              const blob = await clipboardItem.getType(type);
              const file = new File([blob], `pasted-image-${Date.now()}.png`, { type });
              addFiles([file]);
              return;
            } catch (blobErr) {
              console.error('Error reading image from clipboard:', blobErr);
            }
          }
        }
      }
      
      // Если не нашли изображение, пробуем текст
      try {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          await handleMediaUrl(text);
          return;
        }
      } catch (textErr) {
        console.error('Error reading clipboard text:', textErr);
      }
      
    } catch (err) {
      console.error('Error reading clipboard items:', err);
      // Пробуем альтернативный метод - чтение текста
      try {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          await handleMediaUrl(text);
          return;
        }
      } catch (textErr) {
        console.error('Error reading clipboard text as fallback:', textErr);
        setError(t('file.clipboardReadFailed'));
      }
    }
  };

  // Функция для обработки медиа ссылок через API
  const handleMediaUrl = async (url: string) => {
    // Проверяем, что URL не пустой
    if (!url || url.trim() === '') {
      setError(t('file.emptyUrl'));
      return;
    }
    
    try {
      setError(t('common.loading'));
      
      // Отправляем URL на сервер для загрузки
      const response = await filesAPI.downloadFromUrl(url);
      
      if (response.data?.id) {
        // Сервер уже обработал файл и сохранил его
        try {
          const fileResponse = await filesAPI.getFile(response.data.id);
          if (fileResponse.data) {
            // Создаем фейковый файл объект для отображения в списке
            const fakeFile = new File([new ArrayBuffer(0)], fileResponse.data.original_name || `downloaded-${Date.now()}`, {
              type: fileResponse.data.mime_type || 'application/octet-stream',
              lastModified: new Date(fileResponse.data.uploaded_at || Date.now()).getTime()
            }) as FileWithPreview;
            
            // Добавляем специальные свойства
            fakeFile.id = response.data.id;
            fakeFile.originalFile = fakeFile;
            
            // Добавляем флаг, что файл уже загружен на сервер
            (fakeFile as any).alreadyUploaded = true;
            (fakeFile as any).serverFileId = response.data.id;
            
            setFiles(prev => [...prev, fakeFile]);
            setError('');
            setSuccess(t('file.clipboardUrlSuccess', { filename: fileResponse.data.original_name }));
          }
        } catch (fileErr: any) {
          console.error('Error getting file info:', fileErr);
          setError(t('file.failedToUpdate'));
        }
      } else {
        setError('Unexpected server response');
      }
    } catch (err: any) {
      console.error('Error downloading media:', err);
      const errorMessage = err.response?.data?.detail || err.response?.data?.message || err.message || t('file.downloadFailed', { error: 'Unknown error' });
      setError(t('file.downloadFailed', { error: errorMessage }));
    }
  };

  // Безопасная функция для получения имени файла
  const getFileName = (file: File): string => {
    // Проверяем, есть ли имя файла
    if (file.name && typeof file.name === 'string' && file.name.trim() !== '') {
      return file.name;
    }
    
    // Генерируем имя с описанием
    const timestamp = new Date().getTime();
    const random = Math.random().toString(36).substring(2, 7);
    return `unnamed_${timestamp}_${random}`;
  };

  // Функция для определения типа файла по расширению
  const getFileTypeByExtension = (filename: string): string => {
    // Проверка на существование имени файла
    if (!filename) return 'other';
    
    const parts = filename.toLowerCase().split('.');
    if (parts.length < 2) return 'other';
    
    const extension = parts.pop();
    
    if (!extension) return 'other';
    
    switch (extension) {
      // Изображения
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
      case 'svg':
      case 'avif':
        return 'image';
      
      // Видео
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
      case 'flv':
      case 'webm':
      case 'mkv':
        return 'video';
      
      // Аудио
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'flac':
      case 'aac':
      case 'wma':
        return 'audio';
      
      // Документы
      case 'pdf':
      case 'doc':
      case 'docx':
      case 'txt':
      case 'rtf':
        return 'document';
      
      // Архивы
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return 'archive';
      
      default:
        return 'other';
    }
  };

  // Улучшенная функция определения типа файла
  const getEnhancedFileType = (file: File): string => {
    // Сначала пробуем определить по MIME-типу
    if (file.type) {
      if (file.type.startsWith('image/')) return 'image';
      if (file.type.startsWith('video/')) return 'video';
      if (file.type.startsWith('audio/')) return 'audio';
      if (file.type.startsWith('text/')) return 'document';
      if (file.type.includes('pdf')) return 'document';
    }
    
    // Если MIME-тип не определен, используем расширение файла
    const fileName = getFileName(file);
    return getFileTypeByExtension(fileName);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const addFiles = (newFiles: File[]) => {
    const filesWithId = newFiles.map(file => {
      // Создаем объект, который содержит все свойства File + дополнительные поля
      const fileWithPreview: FileWithPreview = Object.assign(file, {
        id: Math.random().toString(36).substr(2, 9),
        preview: getEnhancedFileType(file) === 'image' ? URL.createObjectURL(file) : undefined,
        originalFile: file
      });
      return fileWithPreview;
    });
    
    setFiles(prev => [...prev, ...filesWithId]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(f => f.id !== id);
    });
    
    // Remove from progress tracking
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[id];
      return newProgress;
    });
  };

  const validateFiles = (): string | null => {
    if (files.length === 0) {
      return t('file.noFilesFound');
    }

    const maxSize = 10000 * 1024 * 1024; // 10000MB
    const invalidFiles = files.filter(file => file.size > maxSize);
    if (invalidFiles.length > 0) {
      const fileNames = invalidFiles.map(f => getFileName(f)).join(', ');
      return t('file.filesTooLarge', { files: fileNames });
    }

    // Поддерживаемые типы файлов
    const supportedTypes = ['image', 'video', 'audio', 'document', 'archive'];
    const unsupportedFiles = files.filter(file => {
      const fileType = getEnhancedFileType(file);
      return !supportedTypes.includes(fileType);
    });
    
    if (unsupportedFiles.length > 0) {
      const fileNames = unsupportedFiles.map(f => getFileName(f)).join(', ');
      return t('file.unsupportedTypes', { files: fileNames });
    }

    return null;
  };

  // Функция для преобразования категории в slug
  const getCategorySlug = (category: string): string => {
    switch (category) {
      case '0+':
        return '0-plus';
      case '16+':
        return '16-plus';
      case '18+':
        return '18-plus';
      default:
        return '0-plus';
    }
  };

  const handleUpload = async () => {
    const validationError = validateFiles();
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');
    
    let successCount = 0;
    let totalFiles = files.length;
    let alreadyUploadedCount = 0;

    try {
      for (const file of files) {
        try {
          // Проверяем, был ли файл уже загружен через URL
          const alreadyUploaded = (file as any).alreadyUploaded;
          const serverFileId = (file as any).serverFileId;
          
          if (alreadyUploaded && serverFileId) {
            // Файл уже на сервере, просто обновляем его метаданные
            setUploadProgress(prev => ({ ...prev, [file.id]: 0 }));
            
            // Обновляем метаданные существующего файла
            await filesAPI.editFile(serverFileId, {
              description: description,
              category: category,
              tagNames: tags.join(',')
            });
            
            setUploadProgress(prev => ({ ...prev, [file.id]: 100 }));
            successCount++;
            alreadyUploadedCount++;
            continue;
          }
          
          // Обычная загрузка файла
          setUploadProgress(prev => ({ ...prev, [file.id]: 0 }));
          
          const formData = new FormData();
          // Используем оригинальный файл для загрузки
          formData.append('file', file);
          formData.append('description', description);
          formData.append('tag_names', tags.join(','));
          
          // Преобразуем категорию в правильный slug
          const categorySlug = getCategorySlug(category);
          formData.append('category', categorySlug);

          await filesAPI.uploadFile(formData);
          
          setUploadProgress(prev => ({ ...prev, [file.id]: 100 }));
          successCount++;
          
        } catch (error: any) {
          console.error(`Error processing ${getFileName(file)}:`, error);
          setUploadProgress(prev => ({ ...prev, [file.id]: -1 }));
        }
      }

      if (successCount === totalFiles) {
        const message = alreadyUploadedCount > 0 
          ? t('file.uploadSuccess', { 
              count: successCount, 
              plural: successCount !== 1 ? 's' : '', 
              urlCount: alreadyUploadedCount 
            })
          : t('file.uploadSuccessSimple', { 
              count: successCount, 
              plural: successCount !== 1 ? 's' : '' 
            });
        
        setSuccess(message);
        
        // Reset form after successful upload
        setTimeout(() => {
          files.forEach(file => file.preview && URL.revokeObjectURL(file.preview));
          setFiles([]);
          setDescription('');
          setTags([]);
          setCategory('0+');
          navigate('/dashboard');
        }, 2000);
      } else if (successCount > 0) {
        setSuccess(t('file.processedSuccess', { success: successCount, total: totalFiles }));
        if (successCount < totalFiles) {
          setError(t('file.processedFailed', { 
            count: totalFiles - successCount, 
            plural: totalFiles - successCount !== 1 ? 's' : '' 
          }));
        }
      } else {
        setError(t('file.processedAllFailed'));
      }
      
    } catch (error: any) {
      setError(error.response?.data?.message || t('file.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Функции для определения типа файла
  const isImage = (file: File) => getEnhancedFileType(file) === 'image';
  const isVideo = (file: File) => getEnhancedFileType(file) === 'video';
  const isAudio = (file: File) => getEnhancedFileType(file) === 'audio';

  // Функция для получения иконки файла
  const getFileIcon = (file: File) => {
    const fileType = getEnhancedFileType(file);
    
    switch (fileType) {
      case 'image':
        return <FileImage className="w-5 h-5 text-slate-400" />;
      case 'video':
        return <FileVideo className="w-5 h-5 text-slate-400" />;
      case 'audio':
        return <FileAudio className="w-5 h-5 text-slate-400" />;
      case 'document':
        return <FileText className="w-5 h-5 text-slate-400" />;
      case 'archive':
        return <FileArchive className="w-5 h-5 text-slate-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  const getFileProgress = (fileId: string) => uploadProgress[fileId] || 0;

  const getSelectedFilesText = () => {
    return t('file.selectedFiles', { count: files.length });
  };

  const getUploadButtonText = () => {
    const count = files.length;
    return t('file.uploadButton', { 
      count, 
      plural: count !== 1 ? 's' : '' 
    });
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('file.upload')}
          </h1>
          <p className="text-slate-400">
            {t('file.organizeMedia')}
          </p>
          {/* Добавляем подсказку для пользователя */}
          <p className="text-slate-500 text-sm mt-2">
            {t('file.pasteTip', { key: isMac() ? 'Cmd' : 'Ctrl' })}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* File Drop Zone */}
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
            disabled={uploading}
          />
          <label
            htmlFor="file-input"
            className={`inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-lg cursor-pointer transition-all duration-300 ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {t('file.selectFiles')}
          </label>
          <p className="text-slate-500 text-sm mt-3">
            {t('file.pasteTip', { key: isMac() ? 'Cmd' : 'Ctrl' })}
          </p>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              {getSelectedFilesText()}
            </h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {files.map((file) => {
                const fileName = getFileName(file);
                const progress = getFileProgress(file.id);
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
                        
                        {/* Progress Bar */}
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
                        onClick={() => removeFile(file.id)}
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
        )}

        {/* File Details Form */}
        <div className="bg-slate-900 rounded-xl p-6 space-y-6">
          <h3 className="text-lg font-semibold text-white">{t('file.fileDetails')}</h3>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              {t('file.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={uploading}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 resize-none disabled:opacity-50"
              placeholder={t('file.addDescription')}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              {t('file.tags')}
            </label>
            <TagInput
              tags={tags}
              onTagsChange={setTags}
              category={category}
              placeholder={t('file.addTags')}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              {t('file.category')}
            </label>
            <div className="flex space-x-4">
              {(['0+', '16+', '18+'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  disabled={uploading}
                  className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 ${
                    category === cat
                      ? cat === '18+'
                        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                        : cat === '16+'
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                        : 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {t('file.chooseRating')}
            </p>
          </div>

          {/* Upload Button */}
          <div className="flex space-x-4 pt-4">
            <button
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                  {t('file.uploading')}
                </div>
              ) : (
                getUploadButtonText()
              )}
            </button>
            
            <button
              onClick={() => navigate('/dashboard')}
              disabled={uploading}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, X, FileImage, FileVideo, FileAudio, FileText, FileArchive, AlertCircle, Folder } from 'lucide-react';
import { Layout } from '../layout/Layout';
import { TagInput } from './TagInput';
import { FilePreviewList } from './FilePreviewList';
import { UploadDropZone } from './UploadDropZone';
import { CollectionSelector } from './CollectionSelector';
import { filesAPI, groupsAPI } from '../../services/api';
import { Group } from '../../types';

// Интерфейс для файла с предварительным просмотром
interface FileWithPreview extends File {
  id: string;
  preview?: string;
  originalFile: File;
}

// Интерфейс пропсов компонента
interface UploadFormProps {
  initialDescription?: string;
  initialTags?: string[];
  initialCategory?: '0+' | '16+' | '18+';
  initialCollectionId?: string | null;
  onUploadSuccess?: () => void;
  onUploadError?: (error: string) => void;
}

export const UploadForm: React.FC<UploadFormProps> = ({
  initialDescription = '',
  initialTags = [],
  initialCategory = '0+',
  initialCollectionId = null,
  onUploadSuccess,
  onUploadError,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [description, setDescription] = useState(initialDescription);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [category, setCategory] = useState<'0+' | '16+' | '18+'>(
    initialCategory
  );
  const [collectionId, setCollectionId] = useState<string | null>(
    initialCollectionId
  );
  const [collections, setCollections] = useState<Group[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Определяем операционную систему
  const isMac = useCallback(() => {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  }, []);

  // Загрузка коллекций при монтировании
  useEffect(() => {
    let isMounted = true;
    const fetchCollections = async () => {
      try {
        const response = await groupsAPI.getGroups();
        if (isMounted) {
          setCollections(response.data.groups || response.data);
        }
      } catch (err) {
        console.error('Error fetching collections:', err);
        if (isMounted) {
          setError(t('file.fetchCollectionsFailed'));
        }
      }
    };
    fetchCollections();

    const handleKeyDown = async (e: KeyboardEvent) => {
      const isPaste = (isMac() ? e.metaKey : e.ctrlKey) && (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М');
      if (isPaste) {
        e.preventDefault();
        if (isMounted) {
          await handlePasteFromClipboard();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMac, t]);

  const handlePasteFromClipboard = async () => {
    // Реализация вставки из буфера обмена
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          await handleMediaUrl(text);
          return;
        }
        setError(t('file.clipboardNotSupported'));
        return;
      }

      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
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

  const handleMediaUrl = async (url: string) => {
    if (!url || url.trim() === '') {
      setError(t('file.emptyUrl'));
      return;
    }
    try {
      setError(t('common.loading'));
      const response = await filesAPI.downloadFromUrl(url);
      if (response.data?.id) {
        try {
          const fileResponse = await filesAPI.getFile(response.data.id);
          if (fileResponse.data) {
            const fakeFile = new File([new ArrayBuffer(0)], fileResponse.data.original_name || `downloaded-${Date.now()}`, {
              type: fileResponse.data.mime_type || 'application/octet-stream',
              lastModified: new Date(fileResponse.data.uploaded_at || Date.now()).getTime()
            }) as FileWithPreview;
            fakeFile.id = response.data.id;
            fakeFile.originalFile = fakeFile;
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

  const getFileName = (file: File): string => {
    if (file.name && typeof file.name === 'string' && file.name.trim() !== '') {
      return file.name;
    }
    const timestamp = new Date().getTime();
    const random = Math.random().toString(36).substring(2, 7);
    return `unnamed_${timestamp}_${random}`;
  };

  const getFileTypeByExtension = (filename: string): string => {
    if (!filename) return 'other';
    const parts = filename.toLowerCase().split('.');
    if (parts.length < 2) return 'other';
    const extension = parts.pop();
    if (!extension) return 'other';
    switch (extension) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
      case 'svg':
      case 'avif':
        return 'image';
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
      case 'flv':
      case 'webm':
      case 'mkv':
        return 'video';
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'flac':
      case 'aac':
      case 'wma':
        return 'audio';
      case 'pdf':
      case 'doc':
      case 'docx':
      case 'txt':
      case 'rtf':
        return 'document';
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

  const getEnhancedFileType = (file: File): string => {
    if (file.type) {
      if (file.type.startsWith('image/')) return 'image';
      if (file.type.startsWith('video/')) return 'video';
      if (file.type.startsWith('audio/')) return 'audio';
      if (file.type.startsWith('text/')) return 'document';
      if (file.type.includes('pdf')) return 'document';
    }
    const fileName = getFileName(file);
    return getFileTypeByExtension(fileName);
  };

  const addFiles = (newFiles: File[]) => {
    const filesWithId = newFiles.map(file => {
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
    const maxSize = 10000 * 1024 * 1024;
    const invalidFiles = files.filter(file => file.size > maxSize);
    if (invalidFiles.length > 0) {
      const fileNames = invalidFiles.map(f => getFileName(f)).join(', ');
      return t('file.filesTooLarge', { files: fileNames });
    }
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
          const alreadyUploaded = (file as any).alreadyUploaded;
          const serverFileId = (file as any).serverFileId;
          if (alreadyUploaded && serverFileId) {
            setUploadProgress(prev => ({ ...prev, [file.id]: 0 }));
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
          setUploadProgress(prev => ({ ...prev, [file.id]: 0 }));
          const formData = new FormData();
          formData.append('file', file);
          formData.append('description', description);
          formData.append('tag_names', tags.join(','));
          const categorySlug = getCategorySlug(category);
          formData.append('category', categorySlug);

          // --- НОВОЕ ---
          if (collectionId) {
              formData.append('group_id', collectionId);
          }
          // --- /НОВОЕ ---

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
        setTimeout(() => {
          files.forEach(file => file.preview && URL.revokeObjectURL(file.preview));
          setFiles([]);
          setDescription('');
          setTags([]);
          setCategory('0+');
          setCollectionId(null);
          if (onUploadSuccess) {
            onUploadSuccess();
          } else {
            navigate('/dashboard');
          }
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
      const errorMessage = error.response?.data?.message || t('file.uploadFailed');
      setError(errorMessage);
      if (onUploadError) {
        onUploadError(errorMessage);
      }
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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          {t('file.upload')}
        </h1>
        <p className="text-slate-400">
          {t('file.organizeMedia')}
        </p>
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
      <UploadDropZone onFilesAdded={addFiles} />
      <FilePreviewList
        files={files}
        onRemove={removeFile}
        uploading={uploading}
        uploadProgress={uploadProgress}
        getFileName={getFileName}
        formatFileSize={formatFileSize}
        getFileIcon={getFileIcon}
        getEnhancedFileType={getEnhancedFileType}
      />
      <div className="bg-slate-900 rounded-xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white">{t('file.fileDetails')}</h3>
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
        <CollectionSelector
          collections={collections}
          collectionId={collectionId}
          onCollectionChange={setCollectionId}
          disabled={uploading}
        />
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
  );
};
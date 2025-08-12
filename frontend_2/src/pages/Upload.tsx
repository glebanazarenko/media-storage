import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, X, FileImage, FileVideo, AlertCircle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { TagInput } from '../components/files/TagInput';
import { filesAPI } from '../services/api';

interface FileWithPreview extends File {
  id: string;
  preview?: string;
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    const filesWithId = newFiles.map(file => ({
      ...file,
      id: Math.random().toString(36).substr(2, 9),
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));
    
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
      return 'Please select at least one file';
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    const invalidFiles = files.filter(file => file.size > maxSize);
    if (invalidFiles.length > 0) {
      return `Files too large: ${invalidFiles.map(f => f.name).join(', ')}. Maximum size is 100MB.`;
    }

    const supportedTypes = ['image/', 'video/', 'audio/'];
    const unsupportedFiles = files.filter(file => 
      !supportedTypes.some(type => file.type.startsWith(type))
    );
    if (unsupportedFiles.length > 0) {
      return `Unsupported file types: ${unsupportedFiles.map(f => f.name).join(', ')}`;
    }

    return null;
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

    try {
      for (const file of files) {
        try {
          setUploadProgress(prev => ({ ...prev, [file.id]: 0 }));
          
          const formData = new FormData();
          formData.append('file', file);
          formData.append('description', description);
          formData.append('tag_names', tags.join(','));
          formData.append('category', category);

          await filesAPI.uploadFile(formData);
          
          setUploadProgress(prev => ({ ...prev, [file.id]: 100 }));
          successCount++;
          
        } catch (error: any) {
          console.error(`Error uploading ${file.name}:`, error);
          setUploadProgress(prev => ({ ...prev, [file.id]: -1 })); // -1 indicates error
        }
      }

      if (successCount === totalFiles) {
        setSuccess(`Successfully uploaded ${successCount} file${successCount !== 1 ? 's' : ''}!`);
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
        setSuccess(`Uploaded ${successCount} of ${totalFiles} files successfully.`);
        if (successCount < totalFiles) {
          setError(`Failed to upload ${totalFiles - successCount} file${totalFiles - successCount !== 1 ? 's' : ''}.`);
        }
      } else {
        setError('Failed to upload any files. Please try again.');
      }
      
    } catch (error: any) {
      setError(error.response?.data?.message || 'Upload failed. Please try again.');
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

  const isImage = (file: File) => file.type.startsWith('image/');
  const isVideo = (file: File) => file.type.startsWith('video/');

  const getFileProgress = (fileId: string) => uploadProgress[fileId] || 0;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('file.upload')}
          </h1>
          <p className="text-slate-400">
            Upload and organize your media files
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
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => e.preventDefault()}
          className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center hover:border-purple-500 transition-colors duration-300 mb-6 bg-slate-900/50"
        >
          <UploadIcon className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Drop files here or click to browse
          </h3>
          <p className="text-slate-400 mb-4">
            Support for images, videos and audio files (max 100MB each)
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
            Select Files
          </label>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Selected Files ({files.length})
            </h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {files.map((file) => {
                const progress = getFileProgress(file.id);
                const hasError = progress === -1;
                
                return (
                  <div key={file.id} className="flex items-center justify-between bg-slate-800 p-4 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {file.preview ? (
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="w-10 h-10 rounded object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
                          {isVideo(file) ? (
                            <FileVideo className="w-5 h-5 text-slate-400" />
                          ) : (
                            <FileImage className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-white font-medium truncate max-w-xs" title={file.name}>
                          {file.name}
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
                          <p className="text-red-400 text-sm mt-1">Upload failed</p>
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
          <h3 className="text-lg font-semibold text-white">File Details</h3>

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
              placeholder="Add a description for your files..."
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
              placeholder="Add tags (e.g., nature, portrait, -unwanted)"
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
              Choose the appropriate content rating for your files
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
                  Uploading...
                </div>
              ) : (
                `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`
              )}
            </button>
            
            <button
              onClick={() => navigate('/dashboard')}
              disabled={uploading}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};
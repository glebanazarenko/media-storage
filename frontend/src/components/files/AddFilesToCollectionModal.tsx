import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileItem } from '../../types';
import { filesAPI, groupsAPI } from '../../services/api';

interface AddFilesToCollectionModalProps {
  collectionId: string;
  onClose: () => void;
  onFilesAdded: () => void;
}

export const AddFilesToCollectionModal: React.FC<AddFilesToCollectionModalProps> = ({ collectionId, onClose, onFilesAdded }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTag, setSearchTag] = useState('');
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorSearch, setErrorSearch] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [errorAdd, setErrorAdd] = useState<string | null>(null);
  const [loadingAddAllByTag, setLoadingAddAllByTag] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim() && !searchTag.trim()) {
        setSearchResults([]);
        return;
    }
    setLoadingSearch(true);
    setErrorSearch(null);
    try {
        const searchParams = {
            query: searchQuery.trim() || undefined,
            includeTags: searchTag.trim() || undefined,
            limit: 1000,
        };

        const collectionFilesResponse = await groupsAPI.getGroupFiles(collectionId, { limit: 1000 });
        const collectionFileIds = new Set(collectionFilesResponse.data.files.map((f: any) => f.id));

        let allMatchingFiles: FileItem[] = [];

        if (searchParams.query || searchParams.includeTags) {
            const searchResponse = await filesAPI.searchFiles(searchParams);
            allMatchingFiles = searchResponse.data.files.map((file: any) => ({
              id: file.id,
              filename: file.original_name,
              size: file.size,
              duration: file.duration || 0,
              thumbnailUrl: file.thumbnail_path ? `${import.meta.env.VITE_API_URL || ''}/files/thumbnail/${file.thumbnail_path.replace('uploads/', '')}` : null,
              previewUrl: file.preview_path ? `${import.meta.env.VITE_API_URL || ''}/files/preview/${file.preview_path.replace('uploads/', '')}` : null,
              url: `${import.meta.env.VITE_API_URL || ''}/files/${file.id}/stream`,
              description: file.description,
              category: file.category?.name || 'unknown',
              tags: file.tags.map((tagId: string, index: number) => ({
                id: tagId,
                name: file.tags_name[index] || tagId
              })),
              owner_id: file.owner_id,
              created_at: file.created_at,
              updated_at: file.updated_at,
              views: file.views,
              downloads: file.downloads,
              file_path: file.file_path,
              thumbnail_path: file.thumbnail_path,
              preview_path: file.preview_path,
              hls_manifest_path: file.hls_manifest_path,
              dash_manifest_path: file.dash_manifest_path,
              mime_type: file.mime_type,
              original_name: file.original_name,
            }));
        }

        const filteredFiles = allMatchingFiles.filter(file => !collectionFileIds.has(file.id));

        setSearchResults(filteredFiles);
        setSelectedFileIds([]);
    } catch (err: any) {
        console.error('Error searching files:', err);
        let errorMessage = t('file.failedToUpdate');
        if (err.response?.data?.detail) {
            if (Array.isArray(err.response.data.detail)) {
                errorMessage = err.response.data.detail[0]?.msg || errorMessage;
            } else {
                errorMessage = err.response.data.detail;
            }
        }
        setErrorSearch(errorMessage);
    } finally {
        setLoadingSearch(false);
    }
  };

  const handleSelectFile = (fileId: string) => {
    setSelectedFileIds(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  const handleAddSelected = async () => {
    if (selectedFileIds.length === 0) return;

    setLoadingAdd(true);
    setErrorAdd(null);
    try {
        for (const fileId of selectedFileIds) {
            await groupsAPI.addFileToGroup(collectionId, fileId);
        }
        onFilesAdded();
        onClose();
    } catch (err: any) {
        console.error('Error adding files to collection:', err);
        let errorMessage = t('file.failedToAddFiles');
        if (err.response?.data?.detail) {
            if (Array.isArray(err.response.data.detail)) {
                errorMessage = err.response.data.detail[0]?.msg || errorMessage;
            } else {
                errorMessage = err.response.data.detail;
            }
        }
        setErrorAdd(errorMessage);
    } finally {
        setLoadingAdd(false);
    }
  };

  const handleAddAllByTag = async () => {
    if (!searchTag.trim() || searchResults.length === 0) return;

    setLoadingAddAllByTag(true);
    setErrorAdd(null);
    try {
        const fileIdsToAdd = searchResults.map(file => file.id);
        for (const fileId of fileIdsToAdd) {
            await groupsAPI.addFileToGroup(collectionId, fileId);
        }
        onFilesAdded();
        onClose();
    } catch (err: any) {
        console.error('Error adding all files by tag to collection:', err);
        let errorMessage = t('file.failedToAddFiles');
        if (err.response?.data?.detail) {
            if (Array.isArray(err.response.data.detail)) {
                errorMessage = err.response.data.detail[0]?.msg || errorMessage;
            } else {
                errorMessage = err.response.data.detail;
            }
        }
        setErrorAdd(errorMessage);
    } finally {
        setLoadingAddAllByTag(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{t('file.addFiles')}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
            >
              &times;
            </button>
          </div>

          <div className="mb-4 p-4 bg-slate-700 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('file.searchByName')}</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('file.searchFilesByName')}
                  className="w-full bg-slate-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('file.searchByTag')}</label>
                <input
                  type="text"
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  placeholder={t('file.searchFilesByTag')}
                  className="w-full bg-slate-600 text-white rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleSearch}
                disabled={loadingSearch}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                {loadingSearch ? t('file.loading') : t('file.search')}
              </button>
              {searchTag.trim() && searchResults.length > 0 && (
                <button
                  onClick={handleAddAllByTag}
                  disabled={loadingAddAllByTag}
                  className="bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {loadingAddAllByTag ? t('file.loading') : t('file.addAllByTag')}
                </button>
              )}
            </div>
          </div>

          <div className="mb-4">
            {loadingSearch ? (
              <p className="text-slate-400">{t('file.loading')}</p>
            ) : errorSearch ? (
              <p className="text-red-500">{errorSearch}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-60 overflow-y-auto">
                {searchResults.map(file => (
                  <div
                    key={file.id}
                    className={`p-2 rounded-lg cursor-pointer ${selectedFileIds.includes(file.id) ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                    onClick={() => handleSelectFile(file.id)}
                  >
                    <div className="flex items-center space-x-2">
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt={file.filename} className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                          <span className="text-xs text-slate-400">No Thumb</span>
                        </div>
                      )}
                      <div>
                        <p className="text-white text-sm truncate">{file.filename}</p>
                        <p className="text-slate-400 text-xs">{file.size} bytes</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <p className="text-slate-400">{t('file.selectedCount', { count: selectedFileIds.length })}</p>
            <button
              onClick={handleAddSelected}
              disabled={loadingAdd || selectedFileIds.length === 0}
              className={`font-semibold py-2 px-4 rounded-lg transition-colors ${
                loadingAdd || selectedFileIds.length === 0
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {loadingAdd ? t('file.loading') : t('file.addSelected')}
            </button>
          </div>
          {errorAdd && <p className="text-red-500 mt-2">{errorAdd}</p>}
        </div>
      </div>
    </div>
  );
};
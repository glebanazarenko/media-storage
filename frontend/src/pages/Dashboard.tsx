import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/layout/Layout';
import { CategoryFilter } from '../components/files/CategoryFilter';
import { FileGrid } from '../components/files/FileGrid';
import { FileViewerModal } from '../components/files/FileViewerModal';
import { FileItem } from '../types';
import { filesAPI, API_BASE_URL } from '../services/api';
import { useApp } from '../contexts/AppContext';

export interface SearchFilters {
  category: 'all' | '0+' | '16+' | '18+';
  tags: string[];
  excludeTags: string[];
  dateFrom?: string;
  dateTo?: string;
  fileTypes: string[];
  minSize?: number;
  maxSize?: number;
  sortBy: 'date' | 'name' | 'size' | 'views' | 'downloads';
  sortOrder: 'asc' | 'desc';
}

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { searchFilters, setSearchFilters } = useApp();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    pages: 0,
    currentPage: 1
  });
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [pageInput, setPageInput] = useState('');

  useEffect(() => {
    loadFiles();
  }, [searchFilters.category, searchFilters.sortBy, searchFilters.sortOrder]);

  const loadFiles = async (page: number = 1) => {
    setLoading(true);
    setError(null);

    const transformFileData = (file: any): FileItem => {
      const tagsWithNames = file.tags.map((tagId: string, index: number) => ({
        id: tagId,
        name: file.tags_name[index] || tagId
      }));

      const thumbnailUrl = file.thumbnail_path 
        ? `${API_BASE_URL}/files/thumbnail/${file.thumbnail_path.replace('uploads/', '')}`
        : null;
      const previewUrl = file.preview_path 
        ? `${API_BASE_URL}/files/thumbnail/${file.preview_path.replace('uploads/', '')}`
        : null;

      return {
        id: file.id,
        filename: file.original_name,
        file_path: file.file_path,
        mime_type: file.mime_type,
        file_size: file.size,
        category: file.category_id,
        category_name: file.category_name,
        description: file.description,
        tags: tagsWithNames,
        created_at: file.created_at,
        updated_at: file.updated_at,
        thumbnail_url: thumbnailUrl,
        preview_url: previewUrl,
        owner_id: file.owner_id,
      };
    };
    
    try {
      const params = {
        category: searchFilters.category,
        sortBy: searchFilters.sortBy,
        sortOrder: searchFilters.sortOrder,
        page,
        limit: 20
      };

      const response = await filesAPI.getFiles(params);
      
      if (response.data && response.data.files) {
        const transformedFiles = response.data.files.map(transformFileData);
        
        // Рассчитываем количество страниц самостоятельно
        const total = response.data.total;
        const limit = 20;
        const calculatedPages = Math.ceil(total / limit);
        
        setFiles(transformedFiles);
        setStats({
          total: response.data.total,
          pages: calculatedPages,
          currentPage: response.data.page
        });
        setPageInput(response.data.page.toString());
      } else {
        setFiles([]);
        setStats({ total: 0, pages: 0, currentPage: 1 });
        setPageInput('1');
      }
    } catch (error: any) {
      console.error('Error loading files:', error);
      setError(error.response?.data?.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (category: 'all' | '0+' | '16+' | '18+') => {
    const newFilters = {
      ...searchFilters,
      category,
    };
    setSearchFilters(newFilters);
  };

  const handleFileView = (file: FileItem) => {
    setSelectedFile(file);
    const index = files.findIndex(f => f.id === file.id);
    if (index !== -1) {
      setCurrentFileIndex(index);
    }
  };

  const handleCloseViewer = () => {
    setSelectedFile(null);
  };

  const handlePrevFile = () => {
    if (currentFileIndex > 0) {
      const newIndex = currentFileIndex - 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex]);
    }
  };

  const handleNextFile = () => {
    if (currentFileIndex < files.length - 1) {
      const newIndex = currentFileIndex + 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex]);
    }
  };

  const handleFileEdit = (file: FileItem) => {
    console.log('File edit initiated for:', file);
  };

  const handleFileDelete = async (file: FileItem) => {
    if (window.confirm(`Are you sure you want to delete "${file.filename}"?`)) {
      try {
        await filesAPI.deleteFile(file.id);
        await loadFiles(stats.currentPage);
      } catch (error: any) {
        alert(error.response?.data?.message || 'Failed to delete file');
      }
    }
  };

  const handleSortChange = (sortBy: string, sortOrder?: 'asc' | 'desc') => {
    const newSortOrder = sortOrder || 
      (searchFilters.sortBy === sortBy && searchFilters.sortOrder === 'asc' ? 'desc' : 'asc');
    
    const newFilters = {
      ...searchFilters,
      sortBy: sortBy as any,
      sortOrder: newSortOrder
    };
    
    setSearchFilters(newFilters);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= stats.pages && page !== stats.currentPage) {
      loadFiles(page);
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Проверяем, что введено только число
    if (/^\d*$/.test(value)) {
      setPageInput(value);
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(pageInput);
    if (!isNaN(page) && page >= 1 && page <= stats.pages) {
      handlePageChange(page);
    }
  };

  const renderPagination = () => {
    if (stats.pages <= 1) return null;

    return (
      <div className="flex items-center space-x-2">
        <button
          onClick={() => handlePageChange(stats.currentPage - 1)}
          disabled={stats.currentPage <= 1 || loading}
          className="px-3 py-1 bg-slate-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm"
        >
          Previous
        </button>

        <div className="flex items-center space-x-1">
          <span className="text-slate-400 text-sm">Page</span>
          <input
            type="number"
            min="1"
            max={stats.pages}
            value={pageInput}
            onChange={handlePageInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const page = parseInt(pageInput);
                if (!isNaN(page) && page >= 1 && page <= stats.pages) {
                  handlePageChange(page);
                }
              }
            }}
            className="w-10 px-2 py-1 bg-slate-800 border border-slate-700 text-white rounded text-sm focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-slate-400 text-sm">of {stats.pages}</span>
        </div>

        <button
          onClick={() => handlePageChange(stats.currentPage + 1)}
          disabled={stats.currentPage >= stats.pages || loading}
          className="px-3 py-1 bg-slate-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm"
        >
          Next
        </button>
      </div>
    );
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('nav.dashboard')}
          </h1>
          <p className="text-slate-400">
            Manage your media files and collections
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <CategoryFilter 
          onCategoryChange={handleCategoryChange}
          loading={loading}
        />

        {/* Sort Controls and Top Pagination */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-white">
              {searchFilters.category === 'all' ? 'All Files' : `${searchFilters.category} Files`}
            </h2>
            {stats.total > 0 && (
              <span className="text-slate-400 whitespace-nowrap">
                {stats.total} files total
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center justify-center sm:justify-start">
              {renderPagination()}
            </div>
            
            <div className="flex items-center space-x-3">
              <select
                value={searchFilters.sortBy}
                onChange={(e) => handleSortChange(e.target.value, searchFilters.sortOrder)}
                className="bg-slate-800 border border-slate-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
                <option value="size">Sort by Size</option>
              </select>
              
              <button
                onClick={() => handleSortChange(searchFilters.sortBy, searchFilters.sortOrder === 'asc' ? 'desc' : 'asc')}
                className="bg-slate-800 border border-slate-700 text-white px-3 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                {searchFilters.sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
              </button>
            </div>
          </div>
        </div>

        <FileGrid
          files={files}
          loading={loading}
          onView={handleFileView}
          onEdit={(editedFile) => {
            setFiles(prevFiles => 
              prevFiles.map(f => f.id === editedFile.id ? editedFile : f)
            );
          }}
          onDelete={handleFileDelete}
        />

        {/* Bottom Pagination */}
        {stats.pages > 1 && (
          <div className="flex justify-center items-center mt-8">
            {renderPagination()}
          </div>
        )}

        {/* File Viewer Modal */}
        {selectedFile && (
          <FileViewerModal
            file={selectedFile}
            onClose={handleCloseViewer}
            onPrev={handlePrevFile}
            onNext={handleNextFile}
            hasPrev={currentFileIndex > 0}
            hasNext={currentFileIndex < files.length - 1}
          />
        )}
      </div>
    </Layout>
  );
};
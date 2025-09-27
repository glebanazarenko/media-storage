import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/layout/Layout';
import { CategoryFilter } from '../components/files/CategoryFilter';
import { FileGrid } from '../components/files/FileGrid';
import { FileViewerModal } from '../components/files/FileViewerModal';
import { FileItem } from '../types';
import { filesAPI, API_BASE_URL } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { useSearchParams } from 'react-router-dom';

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
  
  // Хук для работы с параметрами URL
  const [searchParams, setSearchParams] = useSearchParams();

  // Получение параметров из URL
  const getFiltersFromURL = useCallback(() => {
    const category = searchParams.get('category') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const sort = searchParams.get('sort') || 'date';
    const order = searchParams.get('order') || 'desc';
    
    return {
      category: category as 'all' | '0+' | '16+' | '18+',
      page: isNaN(page) ? 1 : page,
      sort: sort as 'date' | 'name' | 'size' | 'views' | 'downloads',
      order: order as 'asc' | 'desc'
    };
  }, [searchParams]);

  // Сохранение параметров в URL
  const updateURLParams = useCallback((filters: Partial<ReturnType<typeof getFiltersFromURL>>) => {
    const newParams = new URLSearchParams();
    
    if (filters.category !== undefined) {
      newParams.set('category', filters.category);
    } else {
      newParams.set('category', searchFilters.category);
    }
    
    if (filters.page !== undefined) {
      newParams.set('page', filters.page.toString());
    } else {
      newParams.set('page', stats.currentPage.toString());
    }
    
    if (filters.sort !== undefined) {
      newParams.set('sort', filters.sort);
    } else {
      newParams.set('sort', searchFilters.sortBy);
    }
    
    if (filters.order !== undefined) {
      newParams.set('order', filters.order);
    } else {
      newParams.set('order', searchFilters.sortOrder);
    }
    
    setSearchParams(newParams);
  }, [searchFilters, stats.currentPage, setSearchParams]);

  // Инициализация из URL - только при первом рендере
  useEffect(() => {
    const urlFilters = getFiltersFromURL();
    
    // Обновляем фильтры из URL
    setSearchFilters(prev => ({
      ...prev,
      category: urlFilters.category,
      sortBy: urlFilters.sort,
      sortOrder: urlFilters.order
    }));
    
    // Загружаем файлы с параметрами из URL
    loadFiles(urlFilters.page);
  }, []); // Пустой массив зависимостей - выполняется только при монтировании

  // Загрузка файлов при изменении фильтров
  useEffect(() => {
    // Загружаем файлы при изменении фильтров, но только если это не начальная загрузка
    if (stats.currentPage !== 0) { // Предотвращаем двойную загрузку при инициализации
      loadFiles(1); // Всегда сбрасываем на первую страницу при изменении фильтров
    }
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
        transcoding_status: file.transcoding_status ?? null,
        hls_manifest_path: file.hls_manifest_path ?? null,
        dash_manifest_path: file.dash_manifest_path ?? null,
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
        
        // Обновляем URL после загрузки данных
        updateURLParams({ 
          page: response.data.page,
          category: searchFilters.category,
          sort: searchFilters.sortBy,
          order: searchFilters.sortOrder
        });
      } else {
        setFiles([]);
        setStats({ total: 0, pages: 0, currentPage: 1 });
        setPageInput('1');
      }
    } catch (error: any) {
      console.error('Error loading files:', error);
      setError(error.response?.data?.message || t('file.failedToUpdate'));
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
    // Не вызываем loadFiles здесь - это сделает useEffect
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

  const handlePrevFile = async () => {
    if (currentFileIndex > 0) {
      // Navigate within the current page
      const newIndex = currentFileIndex - 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex]);
    } else if (stats.currentPage > 1) {
      // Current file is the first on the page, and there are previous pages
      console.log("Loading previous page of files for navigation...");
      try {
        const params = {
          category: searchFilters.category,
          sortBy: searchFilters.sortBy,
          sortOrder: searchFilters.sortOrder,
          page: stats.currentPage - 1, // Load the *previous* page
          limit: 20
        };

        const response = await filesAPI.getFiles(params);
        if (response.data && response.data.files) {
          const newTransformedFiles = response.data.files.map((file: any) => {
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
               transcoding_status: file.transcoding_status ?? null,
               hls_manifest_path: file.hls_manifest_path ?? null,
               dash_manifest_path: file.dash_manifest_path ?? null,
             };
          });

          if (newTransformedFiles.length > 0) {
            // Update state with the new page data
            setFiles(newTransformedFiles);
            setStats(prevStats => ({
               ...prevStats,
               currentPage: response.data.page // Update current page in state immediately
            }));
            setPageInput(response.data.page.toString());
            // Update URL
            updateURLParams({ page: response.data.page });

            // Now set the selected file to the *last* one on the newly loaded page
            const lastFileIndex = newTransformedFiles.length - 1;
            setCurrentFileIndex(lastFileIndex); // Index of the last file on the *new* page view context
            setSelectedFile(newTransformedFiles[lastFileIndex]);
          }
        }
      } catch (error) {
        console.error("Error loading previous page for navigation:", error);
        // Optionally, show an error message to the user
      }
    }
    // If on the first page and first file, do nothing (or optionally loop back to last)
  };

  const handleNextFile = async () => { // Make it async
    if (currentFileIndex < files.length - 1) {
      // Navigate within the current page
      const newIndex = currentFileIndex + 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex]);
    } else if (stats.currentPage < stats.pages) {
      // Current file is the last on the page, and there are more pages
      console.log("Loading next page of files for navigation...");
      try {
        // Re-fetch the data for the next page to ensure state is current
        const params = {
          category: searchFilters.category,
          sortBy: searchFilters.sortBy,
          sortOrder: searchFilters.sortOrder,
          page: stats.currentPage + 1, // We want the *next* page data
          limit: 20
        };

        const response = await filesAPI.getFiles(params);
        if (response.data && response.data.files) {
          const newTransformedFiles = response.data.files.map((file: any) => {
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
               transcoding_status: file.transcoding_status ?? null,
               hls_manifest_path: file.hls_manifest_path ?? null,
               dash_manifest_path: file.dash_manifest_path ?? null,
             };
          });

          if (newTransformedFiles.length > 0) {
            // Update state with the new page data
            setFiles(newTransformedFiles);
            setStats(prevStats => ({
               ...prevStats,
               currentPage: response.data.page // Update current page in state immediately
            }));
            setPageInput(response.data.page.toString());
            // Update URL
            updateURLParams({ page: response.data.page });

            // Now set the selected file to the first one on the newly loaded page
            setCurrentFileIndex(0); // Index 0 of the *new* page view context
            setSelectedFile(newTransformedFiles[0]);
          }
        }
      } catch (error) {
        console.error("Error loading next page for navigation:", error);
        // Optionally, show an error message to the user
      }
    }
    // If on the last page and last file, do nothing (or optionally loop back to first)
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
        alert(error.response?.data?.message || t('file.failedToUpdate'));
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
    // Не вызываем loadFiles здесь - это сделает useEffect
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
          {t('file.previous')}
        </button>

        <div className="flex items-center space-x-1">
          <span className="text-slate-400 text-sm">{t('file.page')}</span>
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
          <span className="text-slate-400 text-sm">{t('file.of')} {stats.pages}</span>
        </div>

        <button
          onClick={() => handlePageChange(stats.currentPage + 1)}
          disabled={stats.currentPage >= stats.pages || loading}
          className="px-3 py-1 bg-slate-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm"
        >
          {t('file.next')}
        </button>
      </div>
    );
  };

  const getFileCountText = () => {
    return t('file.filesTotal', { count: stats.total });
  };

  const getCategoryTitle = () => {
    if (searchFilters.category === 'all') {
      return t('file.allFiles');
    }
    return `${searchFilters.category} ${t('file.files')}`;
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('nav.dashboard')}
          </h1>
          <p className="text-slate-400">
            {t('file.manageMedia')}
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
              {getCategoryTitle()}
            </h2>
            {stats.total > 0 && (
              <span className="text-slate-400 whitespace-nowrap">
                {getFileCountText()}
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
                <option value="date">{t('file.sortByDate')}</option>
                <option value="name">{t('file.sortByName')}</option>
                <option value="size">{t('file.sortBySize')}</option>
                <option value="duration">{t('file.sortByDuration')}</option>
              </select>
              
              <button
                onClick={() => handleSortChange(searchFilters.sortBy, searchFilters.sortOrder === 'asc' ? 'desc' : 'asc')}
                className="bg-slate-800 border border-slate-700 text-white px-3 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                {searchFilters.sortOrder === 'asc' ? `↑ ${t('file.ascending')}` : `↓ ${t('file.descending')}`}
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
            hasPrev={currentFileIndex > 0 || stats.currentPage > 1} // Обновлено
            hasNext={currentFileIndex < files.length - 1 || stats.currentPage < stats.pages} // Обновлено
          />
        )}
      </div>
    </Layout>
  );
};
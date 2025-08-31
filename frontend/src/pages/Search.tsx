import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Filter, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { FileGrid } from '../components/files/FileGrid';
import { TagInput } from '../components/files/TagInput';
import { FileItem } from '../types';
import { useApp } from '../contexts/AppContext';
import { filesAPI, API_BASE_URL } from '../services/api';
import { FileViewerModal } from '../components/files/FileViewerModal';
import { useSearchParams } from 'react-router-dom';

export const Search: React.FC = () => {
  const { t } = useTranslation();
  const { searchFilters, setSearchFilters } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [stats, setStats] = useState({
    total: 0,
    pages: 0,
    currentPage: 1
  });
  const [pageInput, setPageInput] = useState('');
  
  // Хук для работы с параметрами URL
  const [searchParams, setSearchParams] = useSearchParams();

  // Получение параметров из URL
  const getFiltersFromURL = useCallback(() => {
    const query = searchParams.get('q') || '';
    const category = searchParams.get('category') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const sort = searchParams.get('sort') || 'date';
    const order = searchParams.get('order') || 'desc';
    const tags = searchParams.get('tags')?.split(',') || [];
    const excludeTags = searchParams.get('exclude_tags')?.split(',') || [];
    
    return {
      query,
      category: category as 'all' | '0+' | '16+' | '18+',
      page: isNaN(page) ? 1 : page,
      sort: sort as 'date' | 'name' | 'size' | 'views' | 'downloads',
      order: order as 'asc' | 'desc',
      tags,
      excludeTags
    };
  }, [searchParams]);

  // Сохранение параметров в URL
  const updateURLParams = useCallback((filters: Partial<ReturnType<typeof getFiltersFromURL>>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    
    if (filters.query !== undefined) {
      if (filters.query) {
        newParams.set('q', filters.query);
      } else {
        newParams.delete('q');
      }
    }
    
    if (filters.category !== undefined) {
      newParams.set('category', filters.category);
    }
    
    if (filters.page !== undefined) {
      newParams.set('page', filters.page.toString());
    }
    
    if (filters.sort !== undefined) {
      newParams.set('sort', filters.sort);
    }
    
    if (filters.order !== undefined) {
      newParams.set('order', filters.order);
    }
    
    if (filters.tags !== undefined) {
      if (filters.tags.length > 0) {
        newParams.set('tags', filters.tags.join(','));
      } else {
        newParams.delete('tags');
      }
    }
    
    if (filters.excludeTags !== undefined) {
      if (filters.excludeTags.length > 0) {
        newParams.set('exclude_tags', filters.excludeTags.join(','));
      } else {
        newParams.delete('exclude_tags');
      }
    }
    
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Инициализация из URL
  useEffect(() => {
    const urlFilters = getFiltersFromURL();
    
    setSearchQuery(urlFilters.query);
    setSearchFilters(prev => ({
      ...prev,
      category: urlFilters.category,
      sortBy: urlFilters.sort,
      sortOrder: urlFilters.order,
      tags: urlFilters.tags,
      excludeTags: urlFilters.excludeTags
    }));
    
    // Загружаем файлы с параметрами из URL
    performSearch(urlFilters.page, urlFilters.query, urlFilters.category, urlFilters.tags, urlFilters.excludeTags, urlFilters.sort, urlFilters.order);
  }, [getFiltersFromURL, setSearchFilters]);

  // Функция для преобразования данных из API в формат FileItem
  const transformFileData = (file: any): FileItem => {
    const tagsWithNames = file.tags.map((tagId: string, index: number) => ({
      id: tagId,
      name: file.tags_name[index] || tagId
    }));

    const thumbnailUrl = file.thumbnail_path 
      ? `${API_BASE_URL}/files/thumbnail/${file.thumbnail_path.replace('uploads/', '')}`
      : null;
    const previewUrl = file.preview_path 
      ? `${API_BASE_URL}/files/preview/${file.preview_path.replace('uploads/', '')}`
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

  const performSearch = async (
    page: number = 1,
    query?: string,
    category?: string,
    includeTags?: string[],
    excludeTags?: string[],
    sortBy?: string,
    sortOrder?: string
  ) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        limit: 20
      };
      
      if (query) params.query = query;
      if (category) params.category = category;
      if (includeTags && includeTags.length > 0) params.includeTags = includeTags.join(',');
      if (excludeTags && excludeTags.length > 0) params.excludeTags = excludeTags.join(',');
      if (sortBy) params.sortBy = sortBy;
      if (sortOrder) params.sortOrder = sortOrder;
      
      const response = await filesAPI.searchFiles(params);

      // Преобразуем данные перед установкой в состояние
      const transformedFiles = response.data.files.map(transformFileData);
      
      // Рассчитываем количество страниц
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
      setLoading(false);
      
      // Обновляем URL после успешного поиска
      updateURLParams({ 
        page: response.data.page,
        query,
        category,
        tags: includeTags,
        excludeTags,
        sort: sortBy,
        order: sortOrder
      });
    } catch (error) {
      console.error('Search error:', error);
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setSearchFilters({
      ...searchFilters,
      [key]: value
    });
  };

  const clearFilters = () => {
    setSearchFilters({
      category: 'all',
      tags: [],
      excludeTags: [],
      sortBy: 'date',
      sortOrder: 'desc'
    });
    setSearchQuery('');
    // Сбрасываем URL параметры
    const newParams = new URLSearchParams();
    setSearchParams(newParams);
  };

  const handleFileView = (file: FileItem) => {
    setSelectedFile(file);
    // Найдем индекс файла в текущем списке
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
    // TODO: Open edit modal
    console.log('File edit initiated for:', file);
  };

  const handleFileDelete = async (file: FileItem) => {
    if (window.confirm(`Are you sure you want to delete "${file.filename}"?`)) {
      try {
        await filesAPI.deleteFile(file.id);
        // Обновляем список файлов после удаления
        setFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
        // Закрываем просмотрщик если удаляем текущий файл
        if (selectedFile?.id === file.id) {
          handleCloseViewer();
        }
      } catch (error: any) {
        alert(error.response?.data?.message || t('file.failedToUpdate'));
      }
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(1, searchQuery, searchFilters.category, searchFilters.tags, searchFilters.excludeTags, searchFilters.sortBy, searchFilters.sortOrder);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= stats.pages && page !== stats.currentPage) {
      performSearch(page, searchQuery, searchFilters.category, searchFilters.tags, searchFilters.excludeTags, searchFilters.sortBy, searchFilters.sortOrder);
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

  const getResultsTitle = () => {
    if (searchQuery) {
      return t('file.searchResults', { query: searchQuery });
    }
    return t('file.recentFiles');
  };

  const getFileCountText = () => {
    return t('file.filesTotal', { count: stats.total });
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('nav.search')}
          </h1>
          <p className="text-slate-400">
            {t('file.searchMedia')}
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full pl-12 pr-12 py-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
          />
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-colors ${
              showFilters ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </form>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="bg-slate-900 rounded-xl p-6 mb-6 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{t('search.filters')}</h3>
              <button
                onClick={clearFilters}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('file.category')}
                </label>
                <select
                  value={searchFilters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="all">{t('category.all')}</option>
                  <option value="0+">{t('category.0+')}</option>
                  <option value="16+">{t('category.16+')}</option>
                  <option value="18+">{t('category.18+')}</option>
                </select>
              </div>

              {/* Sort Options */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('search.sortBy')}
                </label>
                <select
                  value={searchFilters.sortBy}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="date">{t('common.date')}</option>
                  <option value="name">{t('common.name')}</option>
                  <option value="size">{t('common.size')}</option>
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('search.sortOrder')}
                </label>
                <select
                  value={searchFilters.sortOrder}
                  onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="desc">{t('file.descending')}</option>
                  <option value="asc">{t('file.ascending')}</option>
                </select>
              </div>

              {/* Include Tags */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('search.tags')}
                </label>
                <TagInput
                  tags={searchFilters.tags}
                  onTagsChange={(tags) => handleFilterChange('tags', tags)}
                  placeholder={t('tag.add')}
                  allowNegative={false}
                />
              </div>

              {/* Exclude Tags */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('search.excludeTags')}
                </label>
                <TagInput
                  tags={searchFilters.excludeTags}
                  onTagsChange={(tags) => handleFilterChange('excludeTags', tags)}
                  placeholder={t('tag.add')}
                  allowNegative={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Search Results */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-semibold text-white">
                {getResultsTitle()}
              </h2>
              {stats.total > 0 && (
                <span className="text-slate-400 whitespace-nowrap">
                  {getFileCountText()}
                </span>
              )}
            </div>

            <div className="flex items-center justify-center sm:justify-start">
              {renderPagination()}
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
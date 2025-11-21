import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Filter, X, Shuffle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { FileGrid } from '../components/files/FileGrid';
import { TagInput } from '../components/files/TagInput';
import { GroupInput } from '../components/files/GroupInput';
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
  const [minDuration, setMinDuration] = useState<number | ''>('');
  const [maxDuration, setMaxDuration] = useState<number | ''>('');
  const [includeGroups, setIncludeGroups] = useState<string[]>([]);
  const [excludeGroups, setExcludeGroups] = useState<string[]>([]);
  const [randomize, setRandomize] = useState<boolean>(false);

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
    const minDur = searchParams.get('min_duration');
    const maxDur = searchParams.get('max_duration');
    const includeGroups = searchParams.get('include_groups')?.split(',') || [];
    const excludeGroups = searchParams.get('exclude_groups')?.split(',') || [];
    const randomize = searchParams.get('randomize') === 'true'; // Преобразуем строку в булево

    return {
      query,
      category: category as 'all' | '0+' | '16+' | '18+',
      page: isNaN(page) ? 1 : page,
      sort: sort as 'date' | 'name' | 'size' | 'duration',
      order: order as 'asc' | 'desc',
      tags,
      excludeTags,
      minDuration: minDur ? parseFloat(minDur) : undefined,
      maxDuration: maxDur ? parseFloat(maxDur) : undefined,
      includeGroups,
      excludeGroups,
      randomize,
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
    if (filters.minDuration !== undefined) {
      if (filters.minDuration !== '' && filters.minDuration !== undefined) {
        newParams.set('min_duration', filters.minDuration.toString());
      } else {
        newParams.delete('min_duration');
      }
    }
    if (filters.maxDuration !== undefined) {
       if (filters.maxDuration !== '' && filters.maxDuration !== undefined) {
        newParams.set('max_duration', filters.maxDuration.toString());
      } else {
        newParams.delete('max_duration');
      }
    }
    if (filters.includeGroups !== undefined) {
      if (filters.includeGroups.length > 0) {
        newParams.set('include_groups', filters.includeGroups.join(','));
      } else {
        newParams.delete('include_groups');
      }
    }
    if (filters.excludeGroups !== undefined) {
      if (filters.excludeGroups.length > 0) {
        newParams.set('exclude_groups', filters.excludeGroups.join(','));
      } else {
        newParams.delete('exclude_groups');
      }
    }
    if (filters.randomize !== undefined) {
      if (filters.randomize) {
        newParams.set('randomize', 'true');
      } else {
        newParams.delete('randomize');
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
    setMinDuration(urlFilters.minDuration !== undefined ? urlFilters.minDuration : '');
    setMaxDuration(urlFilters.maxDuration !== undefined ? urlFilters.maxDuration : '');
    setIncludeGroups(urlFilters.includeGroups);
    setExcludeGroups(urlFilters.excludeGroups);
    setRandomize(urlFilters.randomize);

    // Загружаем файлы с параметрами из URL
    performSearch(
      urlFilters.page,
      urlFilters.query,
      urlFilters.category,
      urlFilters.tags,
      urlFilters.excludeTags,
      urlFilters.sort,
      urlFilters.order,
      urlFilters.minDuration,
      urlFilters.maxDuration,
      urlFilters.includeGroups,
      urlFilters.excludeGroups,
      urlFilters.randomize
    );
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
      duration: file.duration ?? null,
    };
  };

  const performSearch = async (
    page: number = 1,
    query?: string,
    category?: string,
    includeTags?: string[],
    excludeTags?: string[],
    sortBy?: string,
    sortOrder?: string,
    minDur?: number,
    maxDur?: number,
    includeGroupsParam?: string[],
    excludeGroupsParam?: string[],
    randomizeParam?: boolean
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
      if (minDur !== undefined && minDur !== null) params.minDuration = minDur;
      if (maxDur !== undefined && maxDur !== null) params.maxDuration = maxDur;
      if (includeGroupsParam && includeGroupsParam.length > 0) params.includeGroups = includeGroupsParam.join(',');
      if (excludeGroupsParam && excludeGroupsParam.length > 0) params.excludeGroups = excludeGroupsParam.join(',');
      if (randomizeParam) params.randomize = randomizeParam; // Передаём как boolean, FastAPI сам преобразует в строку в URL

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
        order: sortOrder,
        minDuration: minDur,
        maxDuration: maxDur,
        includeGroups: includeGroupsParam,
        excludeGroups: excludeGroupsParam,
        randomize: randomizeParam,
      });
    } catch (error) {
      console.error('Search error:', error);
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    if (key === 'includeGroups' || key === 'excludeGroups') {
      if (key === 'includeGroups') {
        setIncludeGroups(value);
      } else if (key === 'excludeGroups') {
        setExcludeGroups(value);
      }
      setSearchFilters(prev => ({
        ...prev,
        [key]: value
      }));
    } else if (key === 'randomize') {
      setRandomize(value);
      // Не нужно обновлять searchFilters, так как randomize - это не фильтр в AppContext
    } else {
      setSearchFilters({
        ...searchFilters,
        [key]: value
      });
    }
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
    setMinDuration('');
    setMaxDuration('');
    setIncludeGroups([]);
    setExcludeGroups([]);
    setRandomize(false);
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

  const handlePrevFile = async () => {
    if (currentFileIndex > 0) {
      // Navigate within the current page
      const newIndex = currentFileIndex - 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex]);
    } else if (stats.currentPage > 1) {
      // Current file is the first on the page, and there are previous pages
      console.log("Loading previous page of search results for navigation...");
      try {
        // Формируем параметры, корректно обрабатывая пустые строки
        const params: any = {
          page: stats.currentPage - 1, // Load the *previous* page
          limit: 20
        };
        if (searchQuery) params.query = searchQuery;
        if (searchFilters.category) params.category = searchFilters.category;
        if (searchFilters.tags && searchFilters.tags.length > 0) params.includeTags = searchFilters.tags.join(',');
        if (searchFilters.excludeTags && searchFilters.excludeTags.length > 0) params.excludeTags = searchFilters.excludeTags.join(',');
        if (searchFilters.sortBy) params.sortBy = searchFilters.sortBy;
        if (searchFilters.sortOrder) params.sortOrder = searchFilters.sortOrder;
        // Правильная проверка: только если значение определено и не пустая строка
        if (minDuration !== undefined && minDuration !== '' && minDuration !== null) {
          params.minDuration = Number(minDuration); // Убедимся, что это число
        }
        if (maxDuration !== undefined && maxDuration !== '' && maxDuration !== null) {
          params.maxDuration = Number(maxDuration); // Убедимся, что это число
        }
        if (includeGroups && includeGroups.length > 0) params.includeGroups = includeGroups.join(',');
        if (excludeGroups && excludeGroups.length > 0) params.excludeGroups = excludeGroups.join(',');
        if (randomize) params.randomize = randomize;

        const response = await filesAPI.searchFiles(params);
        const newTransformedFiles = response.data.files.map(transformFileData);
        if (newTransformedFiles.length > 0) {
          // Update state as performSearch does
          setFiles(newTransformedFiles);
          setStats({
            total: response.data.total,
            pages: Math.ceil(response.data.total / 20), // Recalculate if needed, or use response
            currentPage: response.data.page
          });
          setPageInput(response.data.page.toString());
          updateURLParams({
            page: response.data.page,
            query: searchQuery,
            category: searchFilters.category,
            tags: searchFilters.tags,
            excludeTags: searchFilters.excludeTags,
            sort: searchFilters.sortBy,
            order: searchFilters.sortOrder,
            minDuration: minDuration !== undefined && minDuration !== '' && minDuration !== null ? Number(minDuration) : undefined,
            maxDuration: maxDuration !== undefined && maxDuration !== '' && maxDuration !== null ? Number(maxDuration) : undefined,
            includeGroups,
            excludeGroups,
            randomize,
          });
          // Now set the selected file to the *last* one on the newly loaded page
          const lastFileIndex = newTransformedFiles.length - 1;
          setCurrentFileIndex(lastFileIndex); // Index of the last file on the *new* page view context
          setSelectedFile(newTransformedFiles[lastFileIndex]);
        } else {
            // Если по какой-то причине файлов нет, но страница существует
            console.warn("No files found on the previous page, but page number is valid.");
            // Можно оставить как есть или перейти на другую страницу
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
      console.log("Loading next page of search results for navigation...");
      try {
        // Re-call performSearch explicitly here to get the new page data within the function
        const newPageNumber = stats.currentPage + 1;
        // Формируем параметры, корректно обрабатывая пустые строки
        const params: any = {
          page: newPageNumber,
          limit: 20
        };
        if (searchQuery) params.query = searchQuery;
        if (searchFilters.category) params.category = searchFilters.category;
        if (searchFilters.tags && searchFilters.tags.length > 0) params.includeTags = searchFilters.tags.join(',');
        if (searchFilters.excludeTags && searchFilters.excludeTags.length > 0) params.excludeTags = searchFilters.excludeTags.join(',');
        if (searchFilters.sortBy) params.sortBy = searchFilters.sortBy;
        if (searchFilters.sortOrder) params.sortOrder = searchFilters.sortOrder;
        // Правильная проверка: только если значение определено и не пустая строка
        if (minDuration !== undefined && minDuration !== '' && minDuration !== null) {
          params.minDuration = Number(minDuration); // Убедимся, что это число
        }
        if (maxDuration !== undefined && maxDuration !== '' && maxDuration !== null) {
          params.maxDuration = Number(maxDuration); // Убедимся, что это число
        }
        if (includeGroups && includeGroups.length > 0) params.includeGroups = includeGroups.join(',');
        if (excludeGroups && excludeGroups.length > 0) params.excludeGroups = excludeGroups.join(',');
        if (randomize) params.randomize = randomize;

        const response = await filesAPI.searchFiles(params);
        const newTransformedFiles = response.data.files.map(transformFileData);
        if (newTransformedFiles.length > 0) {
          // Update state as performSearch does
          setFiles(newTransformedFiles);
          setStats({
            total: response.data.total,
            pages: Math.ceil(response.data.total / 20), // Recalculate if needed, or use response
            currentPage: response.data.page
          });
          setPageInput(response.data.page.toString());
          updateURLParams({
            page: response.data.page,
            query: searchQuery,
            category: searchFilters.category,
            tags: searchFilters.tags,
            excludeTags: searchFilters.excludeTags,
            sort: searchFilters.sortBy,
            order: searchFilters.sortOrder,
            minDuration: minDuration !== undefined && minDuration !== '' && minDuration !== null ? Number(minDuration) : undefined,
            maxDuration: maxDuration !== undefined && maxDuration !== '' && maxDuration !== null ? Number(maxDuration) : undefined,
            includeGroups,
            excludeGroups,
            randomize,
          });
          // Now set the selected file to the first one on the newly loaded page
          setCurrentFileIndex(0); // Index 0 of the *new* page view context
          setSelectedFile(newTransformedFiles[0]);
        } else {
            // Если по какой-то причине файлов нет, но страница существует
            console.warn("No files found on the next page, but page number is valid.");
            // Можно оставить как есть или перейти на другую страницу
        }
      } catch (error) {
        console.error("Error loading next page for navigation:", error);
        // Optionally, show an error message to the user
      }
    }
    // If on the last page and last file, do nothing (or optionally loop back to first)
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
    performSearch(
      1,
      searchQuery,
      searchFilters.category,
      searchFilters.tags,
      searchFilters.excludeTags,
      searchFilters.sortBy,
      searchFilters.sortOrder,
      minDuration || undefined,
      maxDuration || undefined,
      includeGroups,
      excludeGroups,
      randomize
    );
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= stats.pages && page !== stats.currentPage) {
      performSearch(
        page,
        searchQuery,
        searchFilters.category,
        searchFilters.tags,
        searchFilters.excludeTags,
        searchFilters.sortBy,
        searchFilters.sortOrder,
        minDuration || undefined,
        maxDuration || undefined,
        includeGroups,
        excludeGroups,
        randomize
      );
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

  // Обработчик для кнопки рандомизации
  const handleRandomize = () => {
    // Переключаем состояние рандомизации
    const newRandomizeState = !randomize;
    setRandomize(newRandomizeState);
    // Вызываем поиск с новым состоянием рандомизации, но на текущей странице
    performSearch(
      stats.currentPage, // Сохраняем текущую страницу
      searchQuery,
      searchFilters.category,
      searchFilters.tags,
      searchFilters.excludeTags,
      searchFilters.sortBy,
      searchFilters.sortOrder,
      minDuration || undefined,
      maxDuration || undefined,
      includeGroups,
      excludeGroups,
      newRandomizeState
    );
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
            className={`absolute right-12 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-colors ${
              showFilters ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
          {/* Новая кнопка рандомизации */}
          <button
            type="button"
            onClick={handleRandomize}
            className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-colors ${
              randomize ? 'bg-green-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title={t('search.randomize')} // Добавьте перевод
          >
            <Shuffle className="w-5 h-5" />
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
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('common.minDuration')} ({t('common.second')})
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={minDuration}
                  onChange={(e) => setMinDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder={t('common.minDuration')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                 {t('common.maxDuration')} ({t('common.second')})
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder={t('common.maxDuration')}
                />
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
                  <option value="duration">{t('common.duration')}</option>
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
              {/* Include Groups (Collections) */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('search.includeGroups')}
                </label>
                <GroupInput
                  groups={includeGroups}
                  onGroupsChange={(groups) => handleFilterChange('includeGroups', groups)}
                  placeholder={t('group.add')}
                  allowNegative={false}
                />
              </div>
              {/* Exclude Groups (Collections) */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  {t('search.excludeGroups')}
                </label>
                <GroupInput
                  groups={excludeGroups}
                  onGroupsChange={(groups) => handleFilterChange('excludeGroups', groups)}
                  placeholder={t('group.add')}
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
            hasPrev={currentFileIndex > 0 || stats.currentPage > 1} // Обновлено
            hasNext={currentFileIndex < files.length - 1 || stats.currentPage < stats.pages} // Обновлено
          />
        )}
      </div>
    </Layout>
  );
};
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Filter, X } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { FileGrid } from '../components/files/FileGrid';
import { TagInput } from '../components/files/TagInput';
import { FileItem } from '../types';
import { useApp } from '../contexts/AppContext';

export const Search: React.FC = () => {
  const { t } = useTranslation();
  const { searchFilters, setSearchFilters } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock search results
  const mockSearchResults: FileItem[] = [
    {
      id: '1',
      filename: 'mountain-landscape.jpg',
      description: 'Stunning mountain landscape at sunrise',
      mime_type: 'image/jpeg',
      file_path: '/uploads/mountain.jpg',
      file_size: 2500000,
      category: '0+',
      tags: [
        { id: '1', name: 'landscape' },
        { id: '2', name: 'mountain' },
        { id: '3', name: 'sunrise' }
      ],
      created_at: '2025-01-07T08:00:00Z',
      updated_at: '2025-01-07T08:00:00Z',
      thumbnail_url: 'https://images.pexels.com/photos/417074/pexels-photo-417074.jpeg?auto=compress&cs=tinysrgb&w=400',
      owner_id: '1'
    },
    {
      id: '2',
      filename: 'urban-street.jpg',
      description: 'Street photography in urban environment',
      mime_type: 'image/jpeg',
      file_path: '/uploads/street.jpg',
      file_size: 1800000,
      category: '0+',
      tags: [
        { id: '4', name: 'street' },
        { id: '5', name: 'urban' },
        { id: '6', name: 'people' }
      ],
      created_at: '2025-01-06T14:30:00Z',
      updated_at: '2025-01-06T14:30:00Z',
      thumbnail_url: 'https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?auto=compress&cs=tinysrgb&w=400',
      owner_id: '1'
    }
  ];

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch();
    } else {
      setFiles([]);
    }
  }, [searchQuery, searchFilters]);

  const performSearch = async () => {
    setLoading(true);
    try {
      // Simulate API call
      setTimeout(() => {
        let results = mockSearchResults;
        
        // Filter by category
        if (searchFilters.category !== 'all') {
          results = results.filter(file => file.category === searchFilters.category);
        }
        
        // Filter by search query
        if (searchQuery.trim()) {
          results = results.filter(file =>
            file.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
            file.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            file.tags.some(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()))
          );
        }
        
        setFiles(results);
        setLoading(false);
      }, 500);
    } catch (error) {
      setLoading(false);
      console.error('Search error:', error);
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
      fileTypes: [],
      sortBy: 'date',
      sortOrder: 'desc'
    });
    setSearchQuery('');
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('nav.search')}
          </h1>
          <p className="text-slate-400">
            Search and filter your media collection
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full pl-12 pr-12 py-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-colors ${
              showFilters ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

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
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
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
                  placeholder="Include tags..."
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
                  placeholder="Exclude tags..."
                  allowNegative={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Search Results */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              {searchQuery ? `Search Results for "${searchQuery}"` : 'Recent Files'}
            </h2>
            <span className="text-slate-400">
              {loading ? 'Searching...' : `${files.length} results`}
            </span>
          </div>
        </div>

        <FileGrid
          files={files}
          loading={loading}
        />
      </div>
    </Layout>
  );
};
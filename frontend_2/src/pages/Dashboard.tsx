import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/layout/Layout';
import { CategoryFilter } from '../components/files/CategoryFilter';
import { FileGrid } from '../components/files/FileGrid';
import { FileItem } from '../types';
import { filesAPI } from '../services/api';
import { useApp } from '../contexts/AppContext';

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

  useEffect(() => {
    loadFiles();
  }, [searchFilters.category, searchFilters.sortBy, searchFilters.sortOrder]);

  const loadFiles = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    
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
        setFiles(response.data.files);
        setStats({
          total: response.data.total,
          pages: response.data.pages,
          currentPage: response.data.page
        });
      } else {
        setFiles([]);
        setStats({ total: 0, pages: 0, currentPage: 1 });
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
    await loadFiles(1);
  };

  const handleFileView = async (file: FileItem) => {
    try {
      // Open file in new tab or modal
      const response = await filesAPI.getFileStream(file.id);
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error viewing file:', error);
    }
  };

  const handleFileEdit = (file: FileItem) => {
    // TODO: Open edit modal
    console.log('Edit file:', file);
  };

  const handleFileDelete = async (file: FileItem) => {
    if (window.confirm(`Are you sure you want to delete "${file.filename}"?`)) {
      try {
        await filesAPI.deleteFile(file.id);
        // Reload files
        await loadFiles(stats.currentPage);
      } catch (error: any) {
        alert(error.response?.data?.message || 'Failed to delete file');
      }
    }
  };

  const handleSortChange = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setSearchFilters({
      ...searchFilters,
      sortBy: sortBy as any,
      sortOrder
    });
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

        {/* Sort Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-white">
              {searchFilters.category === 'all' ? 'All Files' : `${searchFilters.category} Files`}
            </h2>
            {stats.total > 0 && (
              <span className="text-slate-400">
                {stats.total} files total
              </span>
            )}
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
              <option value="views">Sort by Views</option>
            </select>
            
            <button
              onClick={() => handleSortChange(searchFilters.sortBy, searchFilters.sortOrder === 'asc' ? 'desc' : 'asc')}
              className="bg-slate-800 border border-slate-700 text-white px-3 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors"
            >
              {searchFilters.sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </button>
          </div>
        </div>

        <FileGrid
          files={files}
          loading={loading}
          onView={handleFileView}
          onEdit={handleFileEdit}
          onDelete={handleFileDelete}
        />

        {/* Pagination */}
        {stats.pages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-8">
            <button
              onClick={() => loadFiles(stats.currentPage - 1)}
              disabled={stats.currentPage <= 1 || loading}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
            >
              Previous
            </button>
            
            <span className="text-slate-400">
              Page {stats.currentPage} of {stats.pages}
            </span>
            
            <button
              onClick={() => loadFiles(stats.currentPage + 1)}
              disabled={stats.currentPage >= stats.pages || loading}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};
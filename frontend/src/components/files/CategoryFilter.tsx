import React from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../contexts/AppContext';

interface CategoryFilterProps {
  onCategoryChange?: (category: 'all' | '0+' | '16+' | '18+') => void;
  loading?: boolean;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({ 
  onCategoryChange,
  loading = false
}) => {
  const { t } = useTranslation();
  const { searchFilters, setSearchFilters } = useApp();

  const categories = [
    { key: 'all', label: t('category.all'), color: 'from-blue-500 to-blue-600' },
    { key: '0+', label: t('category.0+'), color: 'from-green-500 to-green-600' },
    { key: '16+', label: t('category.16+'), color: 'from-orange-500 to-orange-600' },
    { key: '18+', label: t('category.18+'), color: 'from-red-500 to-red-600' },
  ] as const;

  const handleCategoryChange = async (category: 'all' | '0+' | '16+' | '18+') => {
    const newFilters = {
      ...searchFilters,
      category,
    };
    
    setSearchFilters(newFilters);
    
    // Trigger API call if callback is provided
    if (onCategoryChange) {
      onCategoryChange(category);
    }
  };

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {/* Первый ряд - All и 0+ */}
      <button
        key="all"
        onClick={() => handleCategoryChange('all')}
        disabled={loading}
        className={`relative px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
          searchFilters.category === 'all'
            ? `bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg ring-2 ring-white/20`
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600'
        }`}
      >
        {loading && searchFilters.category === 'all' && (
          <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          </div>
        )}
        <span className={loading && searchFilters.category === 'all' ? 'opacity-0' : 'opacity-100'}>
          {t('category.all')}
        </span>
      </button>

      <button
        key="0+"
        onClick={() => handleCategoryChange('0+')}
        disabled={loading}
        className={`relative px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
          searchFilters.category === '0+'
            ? `bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg ring-2 ring-white/20`
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600'
        }`}
      >
        {loading && searchFilters.category === '0+' && (
          <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          </div>
        )}
        <span className={loading && searchFilters.category === '0+' ? 'opacity-0' : 'opacity-100'}>
          {t('category.0+')}
        </span>
      </button>

      {/* Второй ряд - 16+ и 18+ */}
      <button
        key="16+"
        onClick={() => handleCategoryChange('16+')}
        disabled={loading}
        className={`relative px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
          searchFilters.category === '16+'
            ? `bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg ring-2 ring-white/20`
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600'
        }`}
      >
        {loading && searchFilters.category === '16+' && (
          <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          </div>
        )}
        <span className={loading && searchFilters.category === '16+' ? 'opacity-0' : 'opacity-100'}>
          {t('category.16+')}
        </span>
      </button>

      <button
        key="18+"
        onClick={() => handleCategoryChange('18+')}
        disabled={loading}
        className={`relative px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
          searchFilters.category === '18+'
            ? `bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg ring-2 ring-white/20`
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600'
        }`}
      >
        {loading && searchFilters.category === '18+' && (
          <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          </div>
        )}
        <span className={loading && searchFilters.category === '18+' ? 'opacity-0' : 'opacity-100'}>
          {t('category.18+')}
        </span>
      </button>
    </div>
  );
};
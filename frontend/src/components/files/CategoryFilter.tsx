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
      {categories.map((cat) => (
        <button
          key={cat.key}
          onClick={() => handleCategoryChange(cat.key as 'all' | '0+' | '16+' | '18+')}
          disabled={loading}
          className={`relative px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
            searchFilters.category === cat.key
              ? `bg-gradient-to-r ${cat.color} text-white shadow-lg ring-2 ring-white/20`
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600'
          }`}
        >
          {loading && searchFilters.category === cat.key && (
            <div className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            </div>
          )}
          <span className={loading && searchFilters.category === cat.key ? 'opacity-0' : 'opacity-100'}>
            {cat.label}
          </span>
        </button>
      ))}
    </div>
  );
};
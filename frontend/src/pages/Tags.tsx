import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/layout/Layout';
import { tagsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface TagWithCount {
  id: string;
  name: string;
  usage_count: number;
}

export const Tags: React.FC = () => {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTags = async () => {
      try {
        setLoading(true);
        // Используем существующий API endpoint для получения популярных тегов
        const response = await tagsAPI.getPopularTags(); // Запрашиваем 100, можно изменить или добавить пагинацию
        setTags(response.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch tags:', err);
        setError(t('tags.fetchError')); // Добавьте перевод
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, [t]);

  const handleTagClick = (tagName: string) => {
    // Навигация на страницу поиска с предустановленным тегом
    const searchParams = new URLSearchParams();
    searchParams.set('tags', tagName);
    navigate(`/search?${searchParams.toString()}`);
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
            <span className="ml-2 text-slate-400">{t('common.loading')}</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-center text-red-500">
            <p>{error}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('nav.tags')} {/* Или специальный заголовок для страницы тегов */}
          </h1>
          <p className="text-slate-400">
            {t('tags.description')} {/* Добавьте перевод */}
          </p>
        </div>

        {tags.length === 0 ? (
          <div className="text-center text-slate-500">
            {t('tags.noTagsFound')} {/* Добавьте перевод */}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleTagClick(tag.name)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-4 text-left transition-colors duration-200"
              >
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium truncate">{tag.name}</span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">
                    {tag.usage_count}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
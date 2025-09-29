import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Users, Lock, Globe, Folder, Eye, Edit, Trash2 } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { groupsAPI, Group } from '../services/api'; // Импортируем groupsAPI и Group
import { useNavigate } from 'react-router-dom'; // Для навигации

export const Collections: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Group[]>([]); // Используем Group
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Загрузка коллекций (групп) при монтировании
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await groupsAPI.getGroups();
        console.log("API Response for Groups:", response); // Лог для отладки

        // Проверяем, что response.data существует и содержит свойство data
        if (response.data && Array.isArray(response.data.data)) {
            setCollections(response.data.data);
        } else if (Array.isArray(response.data)) {
            // Если API возвращает массив сразу в response.data
            setCollections(response.data);
        } else {
            console.error("Unexpected API response structure:", response);
            setError(t('file.unexpectedApiResponse')); // Добавьте эту строку в i18n, если нужно
            setCollections([]); // Устанавливаем пустой массив в случае ошибки
        }
      } catch (err: any) {
        console.error('Error fetching collections:', err);
        setError(err.response?.data?.detail || t('file.failedToUpdate'));
        setCollections([]); // Устанавливаем пустой массив в случае ошибки
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, [t]);

  const handleCreateCollection = async () => {
    const name = prompt(t('file.enterCollectionName'));
    if (name) {
      try {
        const newCollectionData = await groupsAPI.createGroup({ name });
        console.log("API Response for Create Group:", newCollectionData); // Лог для отладки
        // Проверяем структуру ответа
        if (newCollectionData.data && newCollectionData.data.data) {
            setCollections(prev => [...prev, newCollectionData.data.data]); // Предполагаем { data: Group }
        } else if (newCollectionData.data) {
            setCollections(prev => [...prev, newCollectionData.data]); // Если сразу возвращается Group
        } else {
             console.error("Unexpected API response structure on create:", newCollectionData);
        }
      } catch (err: any) {
        console.error('Error creating collection:', err);
        alert(err.response?.data?.detail || t('file.failedToCreate'));
      }
    }
  };

  const handleDeleteCollection = async (collectionId: string, collectionName: string) => {
    if (window.confirm(t('file.confirmDeleteCollection', { name: collectionName }))) {
      try {
        await groupsAPI.deleteGroup(collectionId);
        // Удаляем коллекцию из списка
        setCollections(prev => prev.filter(c => c.id !== collectionId));
      } catch (err: any) {
        console.error('Error deleting collection:', err);
        alert(err.response?.data?.detail || t('file.failedToDelete'));
      }
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  // Функция для получения эскиза файла для коллекции (пока заглушка)
  const getCollectionThumbnail = (collection: Group): string | null => {
    // В реальности, возможно, коллекция будет хранить ID файла для эскиза или использовать первый файл
    // Пока возвращаем null или генерируем URL
    // Пример: return `https://images.pexels.com/photos/.../${collection.name}.jpeg?auto=compress&cs=tinysrgb&w=400`;
    // Для примера используем генератор изображений
    return `https://placehold.co/400x225/1e293b/94a3b8?text=${encodeURIComponent(collection.name)}`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 flex justify-center items-center h-full">
          <div className="text-white">{t('file.loading')}</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-red-500">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg"
          >
            {t('file.retry')}
          </button>
        </div>
      </Layout>
    );
  }

  // Проверяем, что collections - это массив перед использованием .length и .map
  if (!Array.isArray(collections)) {
     console.error("Collections state is not an array:", collections);
     return (
      <Layout>
        <div className="p-6">
          <div className="text-red-500">{t('file.unexpectedData')}</div> {/* Добавьте эту строку в i18n, если нужно */}
        </div>
      </Layout>
     );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {t('nav.collections')}
            </h1>
            <p className="text-slate-400">
              {t('file.manageMedia')}
            </p>
          </div>
          <button
            onClick={handleCreateCollection}
            className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300"
          >
            <Plus className="w-5 h-5" />
            <span>{t('file.newCollection')}</span>
          </button>
        </div>

        {collections.length === 0 ? ( // Теперь collections гарантированно массив
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Folder className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{t('file.noCollections')}</h3>
            <p className="text-slate-400 mb-6">{t('file.createFirstCollection')}</p>
            <button
              onClick={handleCreateCollection}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300"
            >
              <Plus className="w-5 h-5" />
              <span>{t('file.createCollection')}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => ( // collections - массив
              <div
                key={collection.id}
                className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-700 transition-all duration-300 group relative"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-800 overflow-hidden">
                  <img
                    src={getCollectionThumbnail(collection)}
                    alt={collection.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 right-3 flex space-x-2">
                    {/* Отображаем иконку в зависимости от уровня доступа пользователя */}
                    {/* Предположим, что access_level указывает на роль пользователя */}
                    {collection.access_level === "admin" ? ( // Пример: если пользователь админ
                      <div className="bg-purple-500/20 backdrop-blur-sm border border-purple-500/50 text-purple-300 px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                        <span>Admin</span>
                      </div>
                    ) : collection.access_level === "editor" ? (
                      <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-500/50 text-blue-300 px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                        <span>Editor</span>
                      </div>
                    ) : collection.access_level === "reader" ? (
                      <div className="bg-green-500/20 backdrop-blur-sm border border-green-500/50 text-green-300 px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                        <span>Reader</span>
                      </div>
                    ) : null}
                  </div>
                  {/* Количество файлов пока не приходит из API, нужно будет обновить бэкенд или получать отдельно */}
                  {/* <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
                    {collection.fileCount} {t('file.files')} // Нужно будет добавить в Group
                  </div> */}
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3
                    className="font-semibold text-white text-lg mb-2 group-hover:text-purple-300 transition-colors cursor-pointer"
                    onClick={() => navigate(`/collections/${collection.id}`)} // Навигация по клику на имя
                  >
                    {collection.name}
                  </h3>

                  {collection.description && (
                    <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                      {collection.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-sm text-slate-500">
                    {/* Количество участников пока не приходит из API */}
                    {/* <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{getMemberText(1)} {/* Временно 1, нужно получать из API */}
                    {/* </span>
                    </div> */}
                    <span>{t('file.updated')} {formatDate(collection.updated_at)}</span>
                  </div>
                </div>

                {/* Кнопки действий */}
                <div className="absolute top-3 left-3 flex space-x-1">
                  {/* Просмотр коллекции */}
                  <button
                    onClick={() => navigate(`/collections/${collection.id}`)}
                    className="bg-slate-800/80 backdrop-blur-sm text-white p-1 rounded-full transition-colors hover:bg-slate-700"
                    title={t('file.view')}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {/* Редактировать коллекцию (пока простое переименование через prompt) */}
                  <button
                    onClick={async () => {
                      const newName = prompt(t('file.enterNewName'), collection.name);
                      if (newName && newName !== collection.name) {
                        try {
                          const updatedCollection = await groupsAPI.updateGroup(collection.id, { name: newName, description: collection.description });
                          console.log("API Response for Update Group:", updatedCollection); // Лог для отладки
                          // Проверяем структуру ответа
                          if (updatedCollection.data && updatedCollection.data.data) {
                              setCollections(prev => prev.map(c => c.id === collection.id ? updatedCollection.data.data : c)); // Предполагаем { data: Group }
                          } else if (updatedCollection.data) {
                              setCollections(prev => prev.map(c => c.id === collection.id ? updatedCollection.data : c)); // Если сразу возвращается Group
                          } else {
                             console.error("Unexpected API response structure on update:", updatedCollection);
                          }
                        } catch (err: any) {
                          console.error('Error updating collection:', err);
                          alert(err.response?.data?.detail || t('file.failedToUpdate'));
                        }
                      }
                    }}
                    className="bg-slate-800/80 backdrop-blur-sm text-white p-1 rounded-full transition-colors hover:bg-slate-700"
                    title={t('file.edit')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  {/* Удалить коллекцию */}
                  <button
                    onClick={() => handleDeleteCollection(collection.id, collection.name)}
                    className="bg-slate-800/80 backdrop-blur-sm text-red-400 p-1 rounded-full transition-colors hover:bg-red-900/50"
                    title={t('file.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
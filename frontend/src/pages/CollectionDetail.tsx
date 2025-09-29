import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Users, Lock, Globe, Eye, Edit, Trash2, Download, UserPlus, UserX } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { FileGrid } from '../components/files/FileGrid';
import { FileViewerModal } from '../components/files/FileViewerModal';
import { FileItem } from '../types';
import { groupsAPI, Group, GroupMember, User } from '../services/api'; // Добавлены Group, GroupMember, User
import { usersAPI } from '../services/api'; // Для получения списка пользователей
import { filesAPI } from '../services/api'; // Для загрузки файлов в коллекцию
import { useAuth } from '../contexts/AuthContext'; // Импортируем AuthContext

// --- НОВЫЙ КОМПОНЕНТ: Модальное окно для управления участниками ---
interface MemberManagementModalProps {
  groupId: string;
  onClose: () => void;
  currentUserId: string; // ID текущего пользователя
  creatorId: string; // ID создателя группы
  accessLevel: string; // access_level текущего пользователя (admin, editor, reader)
}

const MemberManagementModal: React.FC<MemberManagementModalProps> = ({ groupId, onClose, currentUserId, creatorId, accessLevel }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState(''); // Используем email для приглашения
  const [newMemberRole, setNewMemberRole] = useState<'reader' | 'editor'>('reader'); // admin обычно не приглашается
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [errorInvite, setErrorInvite] = useState<string | null>(null);

  // Загрузка всех пользователей (для выбора)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        setErrorUsers(null);
        const response = await usersAPI.getUsers(); // Предполагаем, что этот эндпоинт возвращает список пользователей
        // Проверяем структуру ответа
        if (response.data && Array.isArray(response.data.data)) {
            setUsers(response.data.data.filter((u: User) => u.id !== currentUserId)); // Исключаем себя
        } else if (Array.isArray(response.data)) {
            setUsers(response.data.filter((u: User) => u.id !== currentUserId));
        } else {
            console.error("Unexpected API response structure for getUsers:", response);
            setErrorUsers(t('file.unexpectedApiResponse'));
        }
      } catch (err: any) {
        console.error('Error fetching users:', err);
        setErrorUsers(err.response?.data?.detail || t('file.failedToUpdate'));
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [t, currentUserId]);

  const handleInvite = async () => {
    if (!newMemberEmail || !groupId) return;

    setLoadingInvite(true);
    setErrorInvite(null);
    try {
      // Предполагаем, что бэкенд может принимать email напрямую или требует ID
      // Если бэкенд принимает только ID, нужно сначала найти ID по email
      let targetUserId = '';
      const foundUser = users.find(u => u.email === newMemberEmail || u.username === newMemberEmail);
      if (foundUser) {
          targetUserId = foundUser.id;
      } else {
          // Попробовать найти по email напрямую, если бэкенд поддерживает
          // Для простоты, предположим, что бэкенд принимает email и сам находит ID
          // Или бэкенд принимает username
          // В данном случае, отправляем как есть, и бэкенд должен обработать
          // Лучше всего, если бэкенд принимает ID
          // Пока предположим, что пользователь всегда найден через UI выбора
          alert(t('file.userNotFound'));
          return;
      }

      if (targetUserId) {
        await groupsAPI.inviteMember(groupId, { user_id: targetUserId, role: newMemberRole });
        // Закрыть модальное окно или обновить список участников (требует обновления стейта родителя)
        onClose(); // Просто закрываем после приглашения
      } else {
        alert(t('file.userNotFound'));
      }
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setErrorInvite(err.response?.data?.detail || t('file.failedToInvite'));
    } finally {
        setLoadingInvite(false);
    }
  };

  // Функция для удаления участника (требует ID участника)
  const handleRemoveMember = async (userId: string) => {
    if (userId === creatorId) {
        alert(t('file.cannotRemoveCreator'));
        return;
    }
    if (window.confirm(t('file.confirmRemoveMember'))) {
        try {
            await groupsAPI.removeMember(groupId, userId);
            // Обновить список участников (требует обновления стейта родителя)
            // Для простоты, просто закрываем модальное окно
            onClose(); // Закрываем и обновляем родителя (CollectionDetail)
        } catch (err: any) {
            console.error('Error removing member:', err);
            alert(err.response?.data?.detail || t('file.failedToRemove'));
        }
    }
  };

  // Функция для изменения роли участника (требует ID участника)
  const handleChangeRole = async (userId: string, newRole: 'reader' | 'editor') => {
    if (userId === creatorId) {
        alert(t('file.cannotChangeCreatorRole'));
        return;
    }
    try {
        await groupsAPI.updateMemberRole(groupId, userId, { role: newRole });
        // Обновить список участников (требует обновления стейта родителя)
        // Для простоты, просто закрываем модальное окно
        onClose(); // Закрываем и обновляем родителя (CollectionDetail)
    } catch (err: any) {
        console.error('Error updating member role:', err);
        alert(err.response?.data?.detail || t('file.failedToUpdateRole'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{t('file.manageMembers')}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
            >
              &times;
            </button>
          </div>

          {/* Приглашение участника */}
          <div className="mb-6 p-4 bg-slate-700 rounded-lg">
            <h3 className="font-semibold text-white mb-2">{t('file.inviteMember')}</h3>
            <div className="flex space-x-2">
              {/* Выбор пользователя через список (лучше, чем ввод email) */}
              <select
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="flex-grow bg-slate-600 text-white rounded-lg px-3 py-2"
              >
                <option value="">{t('file.selectUser')}</option>
                {users.map(user => (
                  <option key={user.id} value={user.email || user.username}>{user.username} ({user.email})</option>
                ))}
              </select>
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as 'reader' | 'editor')}
                className="bg-slate-600 text-white rounded-lg px-3 py-2"
              >
                <option value="reader">{t('file.roleReader')}</option>
                <option value="editor">{t('file.roleEditor')}</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={loadingInvite}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                {loadingInvite ? <span>{t('file.loading')}</span> : <><UserPlus className="w-4 h-4 mr-1" /> {t('file.invite')}</>}
              </button>
            </div>
            {errorInvite && <p className="text-red-500 mt-2">{errorInvite}</p>}
          </div>

          {/* Список участников */}
          <div>
            <h3 className="font-semibold text-white mb-2">{t('file.membersList')}</h3>
            {loadingUsers ? (
              <p className="text-slate-400">{t('file.loading')}</p>
            ) : errorUsers ? (
              <p className="text-red-500">{errorUsers}</p>
            ) : (
              <ul className="space-y-2">
                {/* Здесь должен быть список участников группы, который можно получить отдельным API вызовом */}
                {/* groupsAPI.getGroupMembers(groupId) - эндпоинт нужно реализовать на бэкенде */}
                {/* Пока отображаем список всех пользователей как пример */}
                {users.map(user => (
                  <li key={user.id} className="flex justify-between items-center bg-slate-700 p-2 rounded">
                    <div>
                      <span className="text-white">{user.username}</span>
                      <span className="text-slate-400 text-sm ml-2">({user.email})</span>
                      {user.id === creatorId && <span className="ml-2 text-purple-400 text-xs">({t('file.creator')})</span>}
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Выбор роли (только если текущий пользователь админ и не создатель) */}
                      {accessLevel === 'admin' && user.id !== creatorId && user.id !== currentUserId && (
                        <>
                          <select
                            value={/* Здесь должно быть текущее значение роли из списка участников */ 'reader'} // Заглушка
                            onChange={(e) => handleChangeRole(user.id, e.target.value as 'reader' | 'editor')}
                            className="bg-slate-600 text-white rounded-lg px-2 py-1 text-sm"
                          >
                            <option value="reader">{t('file.roleReader')}</option>
                            <option value="editor">{t('file.roleEditor')}</option>
                          </select>
                          <button
                            onClick={() => handleRemoveMember(user.id)}
                            className="text-red-500 hover:text-red-400"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {/* Отображение роли, если не админ или создатель */}
                      {(accessLevel !== 'admin' || user.id === creatorId || user.id === currentUserId) && (
                        <span className="text-slate-400 text-sm">
                          {/* Здесь должно быть текущее значение роли из списка участников */ 'reader'} {/* Заглушка */}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
// --- КОНЕЦ НОВОГО КОМПОНЕНТА ---

interface CollectionDetailParams {
  groupId: string;
}

export const CollectionDetail: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams<CollectionDetailParams>();
  const [collection, setCollection] = useState<Group | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [stats, setStats] = useState({ total: 0, pages: 0, currentPage: 1 });
  const [showMemberModal, setShowMemberModal] = useState(false); // Состояние для модального окна участников
  const [showAddFileModal, setShowAddFileModal] = useState(false); // Состояние для модального окна добавления файлов
  const { user } = useAuth(); // Получаем текущего пользователя

  // Получение информации о коллекции (группе)
  useEffect(() => {
    const fetchCollection = async () => {
      if (!groupId) return;
      try {
        setLoading(true);
        setError(null);
        const response = await groupsAPI.getGroup(groupId);
        console.log("API Response for Group Detail:", response); // Лог для отладки
        // Проверяем структуру ответа
        if (response.data && response.data.data) {
             setCollection(response.data.data); // Предполагаем { data: Group }
        } else if (response.data) {
             setCollection(response.data); // Если сразу возвращается Group
        } else {
             console.error("Unexpected API response structure on detail:", response);
             setError(t('file.unexpectedApiResponse'));
        }
      } catch (err: any) {
        console.error('Error fetching collection:', err);
        setError(err.response?.data?.detail || t('file.failedToUpdate'));
      }
    };

    fetchCollection();
  }, [groupId, t]);

  // Загрузка файлов коллекции (группы)
    const loadCollectionFiles = useCallback(async (page: number = 1) => {
    if (!groupId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await groupsAPI.getGroupFiles(groupId, { page, limit: 20 });
      console.log("API Response for Group Files:", response); // Лог для отладки
      if (response.data && response.data.files && Array.isArray(response.data.files)) {
        const transformedFiles = response.data.files.map((file: any) => ({
          id: file.id,
          filename: file.original_name,
          size: file.size,
          duration: file.duration || 0,
          // Используем thumbnail_url и preview_url, как в Dashboard.tsx
          thumbnail_url: file.thumbnail_path ? `${import.meta.env.VITE_API_URL || ''}/files/thumbnail/${file.thumbnail_path.replace('uploads/', '')}` : null,
          preview_url: file.preview_path ? `${import.meta.env.VITE_API_URL || ''}/files/preview/${file.preview_path.replace('uploads/', '')}` : null,
          url: `${import.meta.env.VITE_API_URL || ''}/files/${file.id}/stream`,
          description: file.description,
          category: file.category?.name || 'unknown',
          tags: file.tags.map((tagId: string, index: number) => ({
            id: tagId,
            name: file.tags_name[index] || tagId
          })),
          owner_id: file.owner_id,
          created_at: file.created_at,
          updated_at: file.updated_at,
          views: file.views,
          downloads: file.downloads,
          file_path: file.file_path,
          thumbnail_path: file.thumbnail_path,
          preview_path: file.preview_path,
          hls_manifest_path: file.hls_manifest_path,
          dash_manifest_path: file.dash_manifest_path,
          mime_type: file.mime_type,
          original_name: file.original_name,
        }));
        setFiles(transformedFiles);
        setStats({
          total: response.data.total || 0,
          pages: response.data.limit ? Math.ceil(response.data.total / response.data.limit) : 0,
          currentPage: response.data.page || 1
        });
      } else {
        setFiles([]);
        setStats({ total: 0, pages: 0, currentPage: 1 });
      }
    } catch (err: any) {
      console.error('Error fetching collection files:', err);
      setError(err.response?.data?.detail || t('file.failedToUpdate'));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  // Загрузка файлов при монтировании и изменении groupId
  useEffect(() => {
    loadCollectionFiles(1);
  }, [loadCollectionFiles]);

  // Функции для навигации по файлам в модальном окне
  const handleNextFile = () => {
    if (currentFileIndex < files.length - 1) {
      setCurrentFileIndex(prevIndex => prevIndex + 1);
      setSelectedFile(files[currentFileIndex + 1]);
    } else if (stats.currentPage < stats.pages) {
      console.log("Loading next page of collection files for navigation...");
      loadCollectionFiles(stats.currentPage + 1).then(() => {
        if (files.length > 0) {
          setCurrentFileIndex(0);
          setSelectedFile(files[0]);
        }
      });
    }
  };

  const handlePrevFile = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(prevIndex => prevIndex - 1);
      setSelectedFile(files[currentFileIndex - 1]);
    } else if (stats.currentPage > 1) {
      console.log("Loading previous page of collection files for navigation...");
      loadCollectionFiles(stats.currentPage - 1).then(() => {
        if (files.length > 0) {
          const lastFileIndex = files.length - 1;
          setCurrentFileIndex(lastFileIndex);
          setSelectedFile(files[lastFileIndex]);
        }
      });
    }
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

  const handleFileRemove = async (file: FileItem) => {
    if (window.confirm(`Are you sure you want to remove "${file.filename}" from this collection?`)) {
      try {
        await groupsAPI.removeFileFromGroup(groupId!, file.id);
        setFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
        if (selectedFile?.id === file.id) {
          handleCloseViewer();
        }
      } catch (error: any) {
        alert(error.response?.data?.message || t('file.failedToUpdate'));
      }
    }
  };

  const handleFileEdit = (file: FileItem) => {
    // console.log('File edit initiated for:', file); // TODO: Реализовать модальное окно редактирования
  };

  const handleFileDelete = async (file: FileItem) => {
     // Удаление файла из коллекции - это то же самое, что и handleFileRemove
     // Если вы хотите *полностью* удалить файл из системы, используйте filesAPI.deleteFile(file.id)
     // и перезагрузите файлы коллекции
     handleFileRemove(file);
  };

  if (loading && !collection) {
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
            onClick={() => navigate(-1)}
            className="mt-4 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg"
          >
            {t('file.goBack')}
          </button>
        </div>
      </Layout>
    );
  }

  if (!collection) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-white">{t('file.collectionNotFound')}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('file.back')}</span>
          </button>
          <div className="flex items-center space-x-3">
            {/* Кнопка управления участниками (только для админов/создателей) */}
            {(collection.access_level === 'admin' || collection.creator_id === user?.id) && (
              <button
                onClick={() => setShowMemberModal(true)}
                className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>{t('file.manageMembers')}</span>
              </button>
            )}
            {/* Кнопка добавления файла в коллекцию (только для редакторов/админов/создателей) */}
            {(collection.access_level === 'admin' || collection.access_level === 'editor' || collection.creator_id === user?.id) && (
              <button
                onClick={() => setShowAddFileModal(true)} // Открывает новое модальное окно
                className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t('file.addFiles')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{collection.name}</h1>
              {collection.description && (
                <p className="text-slate-400 mb-4">{collection.description}</p>
              )}
              <div className="flex items-center space-x-4 text-sm text-slate-500">
                <span>{t('file.updated')} {new Date(collection.updated_at).toLocaleDateString()}</span>
                <div className="flex items-center space-x-1">
                  {collection.access_level === "admin" ? (
                    <><span className="text-purple-400">Admin</span></>
                  ) : collection.access_level === "editor" ? (
                    <><span className="text-blue-400">Editor</span></>
                  ) : collection.access_level === "reader" ? (
                    <><span className="text-green-400">Reader</span></>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white py-10">{t('file.loading')}</div>
        ) : (
          <FileGrid
            files={files}
            loading={loading}
            onView={handleFileView}
            onEdit={handleFileEdit}
            onDelete={handleFileDelete} // Используем handleFileDelete для удаления из коллекции
          />
        )}

        {selectedFile && (
          <FileViewerModal
            file={selectedFile}
            onClose={handleCloseViewer}
            onPrev={handlePrevFile}
            onNext={handleNextFile}
            hasPrev={currentFileIndex > 0 || stats.currentPage > 1}
            hasNext={currentFileIndex < files.length - 1 || stats.currentPage < stats.pages}
            onDelete={handleFileDelete} // Передаем функцию удаления в модальное окно
          />
        )}

        {/* Модальное окно управления участниками */}
        {showMemberModal && collection && (
            <MemberManagementModal
            groupId={collection.id}
            onClose={() => {
                setShowMemberModal(false);
            }}
            currentUserId={user?.id || ''} // Передаем реальный ID
            creatorId={collection.creator_id}
            accessLevel={collection.access_level}
            />
        )}

        {/* Модальное окно добавления файлов */}
        {showAddFileModal && (
          <AddFilesToCollectionModal
            collectionId={collection.id}
            onClose={() => setShowAddFileModal(false)}
            onFilesAdded={() => loadCollectionFiles(1)} // Перезагрузить файлы коллекции после добавления
          />
        )}
      </div>
    </Layout>
  );
};

// --- НОВЫЙ КОМПОНЕНТ: Модальное окно для добавления файлов ---
interface AddFilesToCollectionModalProps {
  collectionId: string;
  onClose: () => void;
  onFilesAdded: () => void; // Вызывается после успешного добавления
}

const AddFilesToCollectionModal: React.FC<AddFilesToCollectionModalProps> = ({ collectionId, onClose, onFilesAdded }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState(''); // Для поиска по названию
  const [searchTag, setSearchTag] = useState(''); // Для поиска по тегу
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorSearch, setErrorSearch] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]); // Для выбора нескольких файлов
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [errorAdd, setErrorAdd] = useState<string | null>(null);
  const [loadingAddAllByTag, setLoadingAddAllByTag] = useState(false); // Для кнопки "Добавить все по тегу"

  // Загрузка файлов, НЕ принадлежащих коллекции, по названию или тегу
  const handleSearch = async () => {
    if (!searchQuery.trim() && !searchTag.trim()) {
        setSearchResults([]);
        return;
    }
    setLoadingSearch(true);
    setErrorSearch(null);
    try {
        // Используем searchFiles API для поиска файлов ВНЕ текущей коллекции
        // Параметры: query (для original_name), includeTags
        // Для простоты, сначала получим файлы по запросу/тегу, затем отфильтруем на фронте
        // Лучше всего, если бэкенд предоставит эндпоинт для поиска файлов, НЕ принадлежащих коллекции
        // Пока используем общий поиск и фильтруем на фронте (не идеально)
        const searchParams = {
            query: searchQuery.trim() || undefined, // undefined, если пустая строка
            includeTags: searchTag.trim() || undefined, // undefined, если пустая строка
            limit: 1000, // Ограничиваем количество результатов
            // sortBy: 'date', // Пример сортировки
            // sortOrder: 'desc',
        };

        // Сначала получаем файлы, принадлежащие коллекции (ограничиваем лимит)
        const collectionFilesResponse = await groupsAPI.getGroupFiles(collectionId, { limit: 1000 }); // Исправлено: <= 1000
        const collectionFileIds = new Set(collectionFilesResponse.data.files.map((f: any) => f.id));

        let allMatchingFiles: FileItem[] = [];

        if (searchParams.query || searchParams.includeTags) {
            const searchResponse = await filesAPI.searchFiles(searchParams);
            allMatchingFiles = searchResponse.data.files.map((file: any) => ({
              id: file.id,
              filename: file.original_name,
              size: file.size,
              duration: file.duration || 0,
              thumbnailUrl: file.thumbnail_path ? `${import.meta.env.VITE_API_URL || ''}/files/thumbnail/${file.thumbnail_path.replace('uploads/', '')}` : null,
              previewUrl: file.preview_path ? `${import.meta.env.VITE_API_URL || ''}/files/preview/${file.preview_path.replace('uploads/', '')}` : null,
              url: `${import.meta.env.VITE_API_URL || ''}/files/${file.id}/stream`,
              description: file.description,
              category: file.category?.name || 'unknown',
              tags: file.tags.map((tagId: string, index: number) => ({
                id: tagId,
                name: file.tags_name[index] || tagId
              })),
              owner_id: file.owner_id,
              created_at: file.created_at,
              updated_at: file.updated_at,
              views: file.views,
              downloads: file.downloads,
              file_path: file.file_path,
              thumbnail_path: file.thumbnail_path,
              preview_path: file.preview_path,
              hls_manifest_path: file.hls_manifest_path,
              dash_manifest_path: file.dash_manifest_path,
              mime_type: file.mime_type,
              original_name: file.original_name,
            }));
        }

        // Фильтруем, исключая файлы, уже находящиеся в коллекции
        const filteredFiles = allMatchingFiles.filter(file => !collectionFileIds.has(file.id));

        setSearchResults(filteredFiles);
        setSelectedFileIds([]); // Сбрасываем выбор при новом поиске
    } catch (err: any) {
        console.error('Error searching files:', err);
        // Исправление: обработка ошибки detail
        let errorMessage = t('file.failedToUpdate');
        if (err.response?.data?.detail) {
            if (Array.isArray(err.response.data.detail)) {
                // Берем первое сообщение из массива ошибок
                errorMessage = err.response.data.detail[0]?.msg || errorMessage;
            } else {
                // Если detail - строка, используем её
                errorMessage = err.response.data.detail;
            }
        }
        setErrorSearch(errorMessage);
    } finally {
        setLoadingSearch(false);
    }
  };

  const handleSelectFile = (fileId: string) => {
    setSelectedFileIds(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  const handleAddSelected = async () => {
    if (selectedFileIds.length === 0) return;

    setLoadingAdd(true);
    setErrorAdd(null);
    try {
        for (const fileId of selectedFileIds) {
            await groupsAPI.addFileToGroup(collectionId, fileId);
        }
        onFilesAdded(); // Уведомить родителя об изменении
        onClose(); // Закрыть модальное окно
    } catch (err: any) {
        console.error('Error adding files to collection:', err);
        // Исправление: обработка ошибки detail
        let errorMessage = t('file.failedToAddFiles');
        if (err.response?.data?.detail) {
            if (Array.isArray(err.response.data.detail)) {
                errorMessage = err.response.data.detail[0]?.msg || errorMessage;
            } else {
                errorMessage = err.response.data.detail;
            }
        }
        setErrorAdd(errorMessage);
    } finally {
        setLoadingAdd(false);
    }
  };

  // Функция для добавления ВСЕХ найденных файлов по текущему тегу
  const handleAddAllByTag = async () => {
    if (!searchTag.trim() || searchResults.length === 0) return;

    setLoadingAddAllByTag(true);
    setErrorAdd(null);
    try {
        // Используем только ID файлов из текущих результатов поиска
        const fileIdsToAdd = searchResults.map(file => file.id);
        for (const fileId of fileIdsToAdd) {
            await groupsAPI.addFileToGroup(collectionId, fileId);
        }
        onFilesAdded(); // Уведомить родителя об изменении
        onClose(); // Закрыть модальное окно
    } catch (err: any) {
        console.error('Error adding all files by tag to collection:', err);
        // Исправление: обработка ошибки detail
        let errorMessage = t('file.failedToAddFiles');
        if (err.response?.data?.detail) {
            if (Array.isArray(err.response.data.detail)) {
                errorMessage = err.response.data.detail[0]?.msg || errorMessage;
            } else {
                errorMessage = err.response.data.detail;
            }
        }
        setErrorAdd(errorMessage);
    } finally {
        setLoadingAddAllByTag(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{t('file.addFiles')}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
            >
              &times;
            </button>
          </div>

          {/* Поиск файлов по названию и тегу */}
          <div className="mb-4 p-4 bg-slate-700 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('file.searchByName')}</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('file.searchFilesByName')}
                  className="w-full bg-slate-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('file.searchByTag')}</label>
                <input
                  type="text"
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  placeholder={t('file.searchFilesByTag')}
                  className="w-full bg-slate-600 text-white rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleSearch}
                disabled={loadingSearch}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                {loadingSearch ? t('file.loading') : t('file.search')}
              </button>
              {/* Кнопка "Добавить все по тегу" появляется только если введен тег и есть результаты */}
              {searchTag.trim() && searchResults.length > 0 && (
                <button
                  onClick={handleAddAllByTag}
                  disabled={loadingAddAllByTag}
                  className="bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {loadingAddAllByTag ? t('file.loading') : t('file.addAllByTag')}
                </button>
              )}
            </div>
          </div>

          {/* Результаты поиска */}
          <div className="mb-4">
            {loadingSearch ? (
              <p className="text-slate-400">{t('file.loading')}</p>
            ) : errorSearch ? (
              <p className="text-red-500">{errorSearch}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-60 overflow-y-auto">
                {searchResults.map(file => (
                  <div
                    key={file.id}
                    className={`p-2 rounded-lg cursor-pointer ${selectedFileIds.includes(file.id) ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                    onClick={() => handleSelectFile(file.id)}
                  >
                    <div className="flex items-center space-x-2">
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt={file.filename} className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-slate-600 rounded flex items-center justify-center">
                          <span className="text-xs text-slate-400">No Thumb</span>
                        </div>
                      )}
                      <div>
                        <p className="text-white text-sm truncate">{file.filename}</p>
                        <p className="text-slate-400 text-xs">{file.size} bytes</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Кнопка добавить выбранные и статистика */}
          <div className="flex justify-between items-center">
            <p className="text-slate-400">{t('file.selectedCount', { count: selectedFileIds.length })}</p>
            <button
              onClick={handleAddSelected}
              disabled={loadingAdd || selectedFileIds.length === 0}
              className={`font-semibold py-2 px-4 rounded-lg transition-colors ${
                loadingAdd || selectedFileIds.length === 0
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {loadingAdd ? t('file.loading') : t('file.addSelected')}
            </button>
          </div>
          {errorAdd && <p className="text-red-500 mt-2">{errorAdd}</p>}
        </div>
      </div>
    </div>
  );
};
// --- КОНЕЦ НОВОГО КОМПОНЕНТА ---
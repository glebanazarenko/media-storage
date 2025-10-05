import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../layout/Layout';
import { FileGrid } from './FileGrid';
import { FileViewerModal } from './FileViewerModal';
import { FileItem } from '../../types';
import { groupsAPI, Group } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { CollectionHeader } from './CollectionHeader';
import { CollectionActions } from './CollectionActions'; // Убедитесь, что импортирован обновленный компонент
import { MemberManagementModal } from './MemberManagementModal';
import { AddFilesToCollectionModal } from './AddFilesToCollectionModal';

interface CollectionDetailParams {
  groupId: string;
}

export const CollectionDetailPage: React.FC = () => {
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
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [userRoleInGroup, setUserRoleInGroup] = useState<string | null>(null); // Новое состояние для роли
  const { user } = useAuth();

  // Загрузка информации о коллекции
  useEffect(() => {
    const fetchCollection = async () => {
      if (!groupId) return;
      try {
        setLoading(true);
        setError(null);
        const response = await groupsAPI.getGroup(groupId);
        if (response.data && response.data.data) {
             setCollection(response.data.data);
        } else if (response.data) {
             setCollection(response.data);
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

  // Загрузка роли пользователя в группе
  useEffect(() => {
    if (!groupId || !user?.id) return;

    const fetchUserRole = async () => {
      try {
        // Загружаем всех участников группы
        const response = await groupsAPI.getGroupMembers(groupId);
        let membersData = response.data;
        if (membersData && Array.isArray(membersData.members)) {
          // Ищем текущего пользователя в списке участников
          const member = membersData.members.find((m: any) => m.user_id === user.id);
          if (member) {
            setUserRoleInGroup(member.role);
          } else {
            // Пользователь не найден в участниках, возможно, это создатель
            // В данном случае, если пользователь может получить доступ к группе, он должен быть в списке или быть создателем
            // Но если он не в списке, но может читать, его роль может быть какая-то другая или null
            // Для безопасности, если он не в списке, но не создатель, у него нет роли
            // Однако, если он может получить /groups/{id}, то он уже в группе или создатель
            // Поэтому, если он не найден, но может читать, возможно, это ошибка или кэширование
            // На данном этапе, если не найден, установим null
            setUserRoleInGroup(null);
          }
        } else if (Array.isArray(membersData)) {
          const member = membersData.find((m: any) => m.user_id === user.id);
          if (member) {
            setUserRoleInGroup(member.role);
          } else {
            setUserRoleInGroup(null);
          }
        } else {
          console.error("Unexpected API response structure for getGroupMembers (for role):", response);
          setUserRoleInGroup(null); // Устанавливаем null в случае ошибки структуры
        }
      } catch (err: any) {
        console.error('Error fetching user role in group:', err);
        // В случае ошибки, можно установить роль как null или reader, если пользователь может читать группу
        // Но лучше обработать это явно, возможно, показав ошибку или перенаправив
        // Для простоты, устанавливаем null
        setUserRoleInGroup(null);
      }
    };

    fetchUserRole();
  }, [groupId, user?.id, t]); // Добавлен user.id в зависимости


  // Загрузка файлов коллекции (группы)
  const loadCollectionFiles = useCallback(async (page: number = 1) => {
    if (!groupId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await groupsAPI.getGroupFiles(groupId, { page, limit: 20 });
      console.log(response);
      if (response.data && response.data.files && Array.isArray(response.data.files)) {
        const transformedFiles = response.data.files.map((file: any) => ({
          id: file.id,
          filename: file.original_name,
          size: file.size,
          duration: file.duration || 0,
          thumbnail_url: file.thumbnail_path ? `${import.meta.env.VITE_API_URL || ''}/files/thumbnail/${file.thumbnail_path.replace('uploads/', '')}` : null,
          preview_url: file.preview_path ? `${import.meta.env.VITE_API_URL || ''}/files/preview/${file.preview_path.replace('uploads/', '')}` : null,
          url: `${import.meta.env.VITE_API_URL || ''}/files/${file.id}/stream`,
          description: file.description,
          category_name: file.category_name || 'unknown',
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
        await groupsAPI.removeFileFromGroup(file.id);
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
        <CollectionActions
          collection={collection}
          user={user}
          userRoleInGroup={userRoleInGroup} // Передаём роль
          onBackClick={() => navigate(-1)}
          onManageMembersClick={() => setShowMemberModal(true)}
          onAddFilesClick={() => setShowAddFileModal(true)}
        />
        <CollectionHeader collection={collection} userRoleInGroup={userRoleInGroup}/>
        {loading ? (
          <div className="text-center text-white py-10">{t('file.loading')}</div>
        ) : (
          <FileGrid
            files={files}
            loading={loading}
            onView={handleFileView}
            onEdit={handleFileEdit}
            onDelete={handleFileDelete}
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
            onDelete={handleFileDelete}
          />
        )}

        {showMemberModal && collection && (
            <MemberManagementModal
            groupId={collection.id}
            onClose={() => setShowMemberModal(false)}
            currentUserId={user?.id || ''}
            creatorId={collection.creator_id}
            accessLevel={userRoleInGroup || ''} // Передаём актуальную роль в модальное окно
            />
        )}

        {showAddFileModal && collection && (
          <AddFilesToCollectionModal
            collectionId={collection.id}
            onClose={() => setShowAddFileModal(false)}
            onFilesAdded={() => loadCollectionFiles(1)}
          />
        )}
      </div>
    </Layout>
  );
};
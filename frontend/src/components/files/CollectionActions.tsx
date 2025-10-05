import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Users } from 'lucide-react';
import { Group, User } from '../../types'; // Убедитесь, что User определен

interface CollectionActionsProps {
  collection: Group; // Остается для доступа к creator_id
  user: User | null;
  userRoleInGroup: string | null; // Новая пропс для роли пользователя в группе
  onBackClick: () => void;
  onManageMembersClick: () => void;
  onAddFilesClick: () => void;
}

export const CollectionActions: React.FC<CollectionActionsProps> = ({
  collection,
  user,
  userRoleInGroup, // Используем новую пропс
  onBackClick,
  onManageMembersClick,
  onAddFilesClick,
}) => {
  const { t } = useTranslation();

  // Логика проверки прав на основе userRoleInGroup
  const canManageMembers = userRoleInGroup === 'admin' || collection.creator_id === user?.id;
  const canAddFiles = ['admin', 'editor'].includes(userRoleInGroup || '') || collection.creator_id === user?.id;

  return (
    <div className="flex items-center justify-between mb-6">
      <button
        onClick={onBackClick}
        className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>{t('file.back')}</span>
      </button>
      <div className="flex items-center space-x-3">
        {canManageMembers && ( // Проверяем canManageMembers
          <button
            onClick={onManageMembersClick}
            className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>{t('file.manageMembers')}</span>
          </button>
        )}
        {canAddFiles && ( // Проверяем canAddFiles
          <button
            onClick={onAddFilesClick}
            className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('file.addFiles')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
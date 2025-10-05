import React from 'react';
import { useTranslation } from 'react-i18next';
import { Group } from '../../types';

interface CollectionHeaderProps {
  collection: Group;
  userRoleInGroup: string | null; // Новый пропс
}

export const CollectionHeader: React.FC<CollectionHeaderProps> = ({ collection, userRoleInGroup }) => {
  const { t } = useTranslation();

  return (
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
              {userRoleInGroup === "admin" ? (
                <><span className="text-purple-400">{t('Admin')} </span></>
              ) : userRoleInGroup === "editor" ? (
                <><span className="text-blue-400">{t('Editer')} </span></>
              ) : userRoleInGroup === "reader" ? (
                <><span className="text-green-400">{t('Reader')} </span></>
              ) : (
                // Если роль не определена, можно показать "No Access" или просто не отображать
                <><span className="text-slate-500">No Access</span></> // Или null
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
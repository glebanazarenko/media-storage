import React from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { Group } from '../../types';

interface CollectionSelectorProps {
  collections: Group[];
  collectionId: string | null;
  onCollectionChange: (id: string | null) => void;
  disabled: boolean;
}

export const CollectionSelector: React.FC<CollectionSelectorProps> = ({
  collections,
  collectionId,
  onCollectionChange,
  disabled,
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <label className="block text-sm font-medium text-slate-200 mb-2">
        {t('file.collection')}
      </label>
      <select
        value={collectionId || ''}
        onChange={(e) => onCollectionChange(e.target.value || null)}
        disabled={disabled}
        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
      >
        <option value="">{t('file.noCollection')}</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400 mt-2">
        {t('file.selectCollectionHint')}
      </p>
    </div>
  );
};
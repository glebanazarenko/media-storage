import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Users, Lock, Globe, Folder } from 'lucide-react';
import { Layout } from '../components/layout/Layout';

export const Collections: React.FC = () => {
  const { t } = useTranslation();
  const [collections] = useState([
    {
      id: '1',
      name: 'Vacation Photos 2024',
      description: 'Summer vacation memories',
      fileCount: 127,
      isPrivate: false,
      memberCount: 3,
      thumbnail: 'https://images.pexels.com/photos/1287145/pexels-photo-1287145.jpeg?auto=compress&cs=tinysrgb&w=400',
      lastUpdated: '2025-01-07T12:00:00Z'
    },
    {
      id: '2',
      name: 'Work Projects',
      description: 'Professional work and client projects',
      fileCount: 89,
      isPrivate: true,
      memberCount: 1,
      thumbnail: 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=400',
      lastUpdated: '2025-01-06T15:30:00Z'
    },
    {
      id: '3',
      name: 'Photography Portfolio',
      description: 'Best photography work for portfolio',
      fileCount: 45,
      isPrivate: false,
      memberCount: 7,
      thumbnail: 'https://images.pexels.com/photos/1264210/pexels-photo-1264210.jpeg?auto=compress&cs=tinysrgb&w=400',
      lastUpdated: '2025-01-05T18:45:00Z'
    }
  ]);

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const getMemberText = (count: number): string => {
    if (count === 1) {
      return `1 ${t('file.member')}`;
    }
    return `${count} ${t('file.members')}`;
  };

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
          <button className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300">
            <Plus className="w-5 h-5" />
            <span>{t('file.newCollection')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-700 transition-all duration-300 cursor-pointer group"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-slate-800 overflow-hidden">
                <img
                  src={collection.thumbnail}
                  alt={collection.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 right-3 flex space-x-2">
                  {collection.isPrivate ? (
                    <div className="bg-red-500/20 backdrop-blur-sm border border-red-500/50 text-red-300 px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>{t('file.private')}</span>
                    </div>
                  ) : (
                    <div className="bg-green-500/20 backdrop-blur-sm border border-green-500/50 text-green-300 px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                      <Globe className="w-3 h-3" />
                      <span>{t('file.public')}</span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
                  {collection.fileCount} {t('file.files')}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <h3 className="font-semibold text-white text-lg mb-2 group-hover:text-purple-300 transition-colors">
                  {collection.name}
                </h3>
                
                {collection.description && (
                  <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                    {collection.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm text-slate-500">
                  <div className="flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>{getMemberText(collection.memberCount)}</span>
                  </div>
                  <span>{t('file.updated')} {formatDate(collection.lastUpdated)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {collections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Folder className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{t('file.noCollections')}</h3>
            <p className="text-slate-400 mb-6">{t('file.createFirstCollection')}</p>
            <button className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300">
              <Plus className="w-5 h-5" />
              <span>{t('file.createCollection')}</span>
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};
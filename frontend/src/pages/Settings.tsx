import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, User, Globe, Eye, EyeOff, Languages, Palette } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { usersAPI } from '../services/api';
import { BackupSection } from '../components/settings/BackupSection';

export const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { language, setLanguage, blurAdultContent, setBlurAdultContent } = useApp();
  
  const [profile, setProfile] = useState({
    username: user?.username || '',
    email: user?.email || '',
    bio: '',
  });
  
  const [preferences, setPreferences] = useState({
    theme: 'dark',
    defaultCategory: 'all' as 'all' | '0+' | '16+' | '18+',
    autoBlur: blurAdultContent,
    language: language,
    notifications: true,
  });
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await usersAPI.getProfile();
      const userData = response.data;
      setProfile({
        username: userData.username || '',
        email: userData.email || '',
        bio: userData.bio || '',
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleProfileSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await usersAPI.updateProfile(profile);
      setSuccess(t('settings.profileUpdated'));
    } catch (error: any) {
      setError(error.response?.data?.message || t('settings.failedToUpdate'));
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = (newLanguage: 'en' | 'ru') => {
    setLanguage(newLanguage);
    i18n.changeLanguage(newLanguage);
    setPreferences(prev => ({ ...prev, language: newLanguage }));
  };

  const handleBlurToggle = () => {
    const newBlur = !blurAdultContent;
    setBlurAdultContent(newBlur);
    setPreferences(prev => ({ ...prev, autoBlur: newBlur }));
  };

  const getMemberSince = () => {
    if (user?.created_at) {
      return new Date(user.created_at).getFullYear();
    }
    return '-';
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('nav.settings')}
          </h1>
          <p className="text-slate-400">
            {t('settings.manageAccount')}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        <div className="space-y-8">
          {/* Profile Settings */}
          <div className="bg-slate-900 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-6">
              <User className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">{t('settings.profile')}</h2>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    {t('auth.username')}
                  </label>
                  <input
                    type="text"
                    value={profile.username}
                    onChange={(e) => setProfile(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    {t('auth.email')}
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Bio
                </label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 resize-none"
                  placeholder={t('settings.tellAbout')}
                />
              </div>

              <button
                onClick={handleProfileSave}
                disabled={loading}
                className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                <span>{loading ? t('common.loading') : t('common.save')}</span>
              </button>
            </div>
          </div>

          {/* Language & Localization */}
          <div className="bg-slate-900 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Languages className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">{t('settings.languageLocalization')}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-3">
                  {t('settings.interfaceLanguage')}
                </label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => handleLanguageChange('en')}
                    className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                      language === 'en'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => handleLanguageChange('ru')}
                    className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                      language === 'ru'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Русский
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Content Preferences */}
          <div className="bg-slate-900 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Eye className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">{t('settings.contentPreferences')}</h2>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">{t('settings.blurAdult')}</h3>
                  <p className="text-slate-400 text-sm">{t('settings.blurAdultDesc')}</p>
                </div>
                <button
                  onClick={handleBlurToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    blurAdultContent ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                      blurAdultContent ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-3">
                  {t('settings.defaultCategory')}
                </label>
                <select
                  value={preferences.defaultCategory}
                  onChange={(e) => setPreferences(prev => ({ 
                    ...prev, 
                    defaultCategory: e.target.value as 'all' | '0+' | '16+' | '18+' 
                  }))}
                  className="w-full max-w-xs px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="all">{t('settings.allContent')}</option>
                  <option value="0+">{t('settings.only0')}</option>
                  <option value="16+">{t('settings.below16')}</option>
                  <option value="18+">{t('settings.allCategories')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* App Preferences */}
          <div className="bg-slate-900 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Palette className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">{t('settings.appPreferences')}</h2>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">{t('settings.notifications')}</h3>
                  <p className="text-slate-400 text-sm">{t('settings.notificationsDesc')}</p>
                </div>
                <button
                  onClick={() => setPreferences(prev => ({ ...prev, notifications: !prev.notifications }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    preferences.notifications ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                      preferences.notifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-3">
                  {t('settings.theme')}
                </label>
                <select
                  value={preferences.theme}
                  onChange={(e) => setPreferences(prev => ({ ...prev, theme: e.target.value }))}
                  className="w-full max-w-xs px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="dark">{t('settings.darkTheme')}</option>
                  <option value="light">{t('settings.lightTheme')}</option>
                  <option value="auto">{t('settings.autoTheme')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Account Stats */}
          {user && (
            <div className="bg-slate-900 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6">{t('settings.accountInfo')}</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">-</div>
                  <div className="text-slate-400 text-sm">{t('settings.filesUploaded')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">-</div>
                  <div className="text-slate-400 text-sm">{t('settings.totalViews')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">-</div>
                  <div className="text-slate-400 text-sm">{t('settings.collections')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">
                    {getMemberSince()}
                  </div>
                  <div className="text-slate-400 text-sm">{t('settings.memberSince')}</div>
                </div>
              </div>
            </div>
          )}

          {/* Data Backup & Restore */}
          <BackupSection userId={user?.id || ''} />
        </div>
      </div>
    </Layout>
  );
};
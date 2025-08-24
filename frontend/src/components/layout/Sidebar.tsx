import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Home, 
  Upload, 
  Search, 
  Folder, 
  Settings, 
  LogOut,
  ChevronLeft,
  Languages,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';

export const Sidebar: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { logout, user } = useAuth();
  const { sidebarOpen, setSidebarOpen, language, setLanguage, blurAdultContent, setBlurAdultContent } = useApp();
  const location = useLocation();

  const menuItems = [
    { icon: Home, label: t('nav.dashboard'), path: '/dashboard' },
    { icon: Upload, label: t('nav.upload'), path: '/upload' },
    { icon: Search, label: t('nav.search'), path: '/search' },
    { icon: Folder, label: t('nav.collections'), path: '/collections' },
    { icon: Settings, label: t('nav.settings'), path: '/settings' },
  ];

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'ru' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const isActive = (path: string) => location.pathname === path;

  if (!sidebarOpen) {
    return (
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-50 bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg transition-colors"
      >
        <ChevronLeft className="w-5 h-5 rotate-180" />
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 lg:hidden z-40" onClick={() => setSidebarOpen(false)} />
      <div className="fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 z-50 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              MediaVault
            </h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-400 hover:text-white transition-colors lg:hidden"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          {user && (
            <p className="text-sm text-slate-400 mt-2">
              {/* Welcome, {user.username} */}
              {t('nav.welcome')}, {user.username}
            </p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive(item.path)
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Settings */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="flex items-center space-x-3 px-4 py-3 w-full text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-all duration-200"
          >
            <Languages className="w-5 h-5" />
            <span>{language === 'en' ? 'Русский' : 'English'}</span>
          </button>

          {/* Blur Adult Content Toggle */}
          <button
            onClick={() => setBlurAdultContent(!blurAdultContent)}
            className="flex items-center space-x-3 px-4 py-3 w-full text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-all duration-200"
          >
            {blurAdultContent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            <span>{blurAdultContent ? 'Show Adult' : 'Hide Adult'}</span>
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center space-x-3 px-4 py-3 w-full text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </div>
    </>
  );
};
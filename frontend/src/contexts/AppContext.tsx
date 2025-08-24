import React, { createContext, useContext, useState, ReactNode } from 'react';
import { SearchFilters } from '../types';

interface AppContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  searchFilters: SearchFilters;
  setSearchFilters: (filters: SearchFilters) => void;
  language: 'en' | 'ru';
  setLanguage: (lang: 'en' | 'ru') => void;
  blurAdultContent: boolean;
  setBlurAdultContent: (blur: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [language, setLanguage] = useState<'en' | 'ru'>('en');
  const [blurAdultContent, setBlurAdultContent] = useState(true);
  
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    category: 'all',
    tags: [],
    excludeTags: [],
    fileTypes: [],
    sortBy: 'date',
    sortOrder: 'desc'
  });

  return (
    <AppContext.Provider value={{
      sidebarOpen,
      setSidebarOpen,
      searchFilters,
      setSearchFilters,
      language,
      setLanguage,
      blurAdultContent,
      setBlurAdultContent
    }}>
      {children}
    </AppContext.Provider>
  );
};
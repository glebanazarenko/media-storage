import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useApp } from '../../contexts/AppContext';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { sidebarOpen } = useApp();

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
        {children}
      </main>
    </div>
  );
};
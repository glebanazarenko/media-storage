import React from 'react';
import { Home, Upload, Star, Users, Settings, Folder, Tag, Filter, Calendar } from 'lucide-react';

interface SidebarProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeSection = 'all', onSectionChange }) => {
  const menuItems = [
    { id: 'all', label: 'All Media', icon: Home },
    { id: 'recent', label: 'Recent', icon: Calendar },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'collections', label: 'Collections', icon: Folder },
    { id: 'shared', label: 'Shared with Me', icon: Users },
  ];

  const filterItems = [
    { id: 'images', label: 'Images', count: 1234 },
    { id: 'videos', label: 'Videos', count: 567 },
    { id: 'audio', label: 'Audio', count: 89 },
  ];

  const ratingFilters = [
    { id: '0+', label: 'General (0+)', count: 1456 },
    { id: '16+', label: 'Mature (16+)', count: 234 },
    { id: '18+', label: 'Adult (18+)', count: 123 },
  ];

  const popularTags = [
    'landscape', 'portrait', 'nature', 'architecture', 'street',
    'digital-art', 'photography', 'video', 'animation'
  ];

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 h-full overflow-y-auto">
      <div className="p-4">
        {/* Main Navigation */}
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSectionChange?.(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeSection === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Filters Section */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center">
            <Filter className="w-4 h-4 mr-2" />
            File Types
          </h3>
          <div className="space-y-1">
            {filterItems.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center justify-between px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
              >
                <span className="text-sm">{item.label}</span>
                <span className="text-xs bg-gray-700 px-2 py-1 rounded-full">
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Rating */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Content Rating
          </h3>
          <div className="space-y-1">
            {ratingFilters.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center justify-between px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
              >
                <span className="text-sm">{item.label}</span>
                <span className="text-xs bg-gray-700 px-2 py-1 rounded-full">
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Popular Tags */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center">
            <Tag className="w-4 h-4 mr-2" />
            Popular Tags
          </h3>
          <div className="flex flex-wrap gap-1">
            {popularTags.map((tag) => (
              <button
                key={tag}
                className="text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white px-2 py-1 rounded-full transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="mt-8 pt-4 border-t border-gray-800">
          <button className="w-full flex items-center space-x-3 px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
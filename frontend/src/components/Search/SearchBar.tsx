import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Tag, Filter } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearch, 
  placeholder = "Search by tags, filename, or description..." 
}) => {
  const [query, setQuery] = useState('');
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mock tag suggestions - in real app, this would come from API
  const mockTags = [
    'landscape', 'portrait', 'nature', 'architecture', 'street',
    'black-and-white', 'color', 'digital-art', 'photography',
    'video', 'animation', 'music', 'documentary'
  ];

  useEffect(() => {
    if (query.length > 1) {
      const filtered = mockTags.filter(tag => 
        tag.toLowerCase().includes(query.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 5));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    const newQuery = query.includes(' ') 
      ? query.substring(0, query.lastIndexOf(' ') + 1) + suggestion
      : suggestion;
    setQuery(newQuery);
    setShowSuggestions(false);
    onSearch(newQuery);
  };

  const clearSearch = () => {
    setQuery('');
    onSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-10 pr-20 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsAdvanced(!isAdvanced)}
              className={`p-1 transition-colors ${
                isAdvanced ? 'text-blue-400' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center space-x-2"
              >
                <Tag className="w-4 h-4 text-gray-500" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Advanced Search Panel */}
      {isAdvanced && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Include Tags
              </label>
              <input
                type="text"
                placeholder="tag1, tag2, tag3"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Exclude Tags
              </label>
              <input
                type="text"
                placeholder="-unwanted, -tag"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Content Rating
              </label>
              <select className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm">
                <option value="">All Ratings</option>
                <option value="0+">0+ (General)</option>
                <option value="16+">16+ (Mature)</option>
                <option value="18+">18+ (Adult)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                File Type
              </label>
              <select className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm">
                <option value="">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsAdvanced(false)}
              className="px-4 py-2 text-gray-400 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
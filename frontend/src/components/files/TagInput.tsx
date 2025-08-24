import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { tagsAPI } from '../../services/api';
import { Tag } from '../../types';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  allowNegative?: boolean;
  category?: '0+' | '16+' | '18+';
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onTagsChange,
  placeholder = 'Add tags...',
  allowNegative = true,
  category
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchTags = async () => {
      if (inputValue.length > 0) {
        setLoading(true);
        try {
          const query = inputValue.startsWith('-') ? inputValue.slice(1) : inputValue;
          const response = await tagsAPI.searchTags(query, 10);
          setSuggestions(response.data || []);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error searching tags:', error);
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timeoutId = setTimeout(searchTags, 300);
    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    } else if (e.key === ' ' && inputValue.trim()) {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const addTag = (tagToAdd?: string) => {
    const tag = (tagToAdd || inputValue).trim();
    if (tag && !tags.includes(tag)) {
      // Validate tag format
      if (tag.startsWith('-') && !allowNegative) {
        return;
      }
      onTagsChange([...tags, tag]);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const removeTag = (index: number) => {
    onTagsChange(tags.filter((_, i) => i !== index));
  };

  const isExcludeTag = (tag: string) => tag.startsWith('-');

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 p-3 bg-slate-800 border border-slate-700 rounded-lg focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 min-h-[50px] transition-all">
        {tags.map((tag, index) => (
          <div
            key={index}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isExcludeTag(tag)
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 hover:bg-red-500/30'
                : 'bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30'
            }`}
          >
            {isExcludeTag(tag) && <Minus className="w-3 h-3" />}
            {!isExcludeTag(tag) && <Plus className="w-3 h-3" />}
            <span>{isExcludeTag(tag) ? tag.slice(1) : tag}</span>
            <button
              onClick={() => removeTag(index)}
              className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
              type="button"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue && setShowSuggestions(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-400 min-w-[120px] py-1"
        />
        
        {inputValue && (
          <button
            onClick={() => addTag()}
            className="text-slate-400 hover:text-white transition-colors p-1"
            type="button"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-60 overflow-y-auto"
        >
          {loading && (
            <div className="flex items-center justify-center py-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent"></div>
              <span className="ml-2 text-slate-400 text-sm">Searching...</span>
            </div>
          )}
          
          {!loading && suggestions.map((suggestion, index) => {
            const isNegative = inputValue.startsWith('-');
            const suggestionText = isNegative ? `-${suggestion.name}` : suggestion.name;
            const isAlreadyAdded = tags.includes(suggestionText);
            
            return (
              <button
                key={`${suggestion.id}-${index}`}
                onClick={() => addTag(suggestionText)}
                disabled={isAlreadyAdded}
                className={`w-full px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center justify-between ${
                  isAlreadyAdded
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {isNegative ? (
                    <Minus className="w-3 h-3 text-red-400" />
                  ) : (
                    <Plus className="w-3 h-3 text-purple-400" />
                  )}
                  <span>{suggestion.name}</span>
                </div>
                {suggestion.usage_count && (
                  <span className="text-xs text-slate-500">
                    {suggestion.usage_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
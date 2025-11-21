import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Minus } from 'lucide-react';
import { groupsAPI } from '../../services/api';
import { Group } from '../../types';

interface GroupInputProps {
  groups: string[];
  onGroupsChange: (groups: string[]) => void;
  placeholder?: string;
  allowNegative?: boolean;
}

export const GroupInput: React.FC<GroupInputProps> = ({
  groups,
  onGroupsChange,
  placeholder = 'Add groups...',
  allowNegative = false,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Group[]>([]);
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
    const searchGroups = async () => {
      if (inputValue.length > 0) {
        setLoading(true);
        try {
          // const query = inputValue.startsWith('-') ? inputValue.slice(1) : inputValue;
          const response = await groupsAPI.getGroups(); // Получаем все группы пользователя
          // Фильтруем по введённому значению и исключаем уже добавленные
          const filteredGroups = response.data.filter(
            g => g.name.toLowerCase().includes(inputValue.toLowerCase()) && !groups.includes(g.name)
          );
          setSuggestions(filteredGroups);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error fetching groups:', error);
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };
    const timeoutId = setTimeout(searchGroups, 300);
    return () => clearTimeout(timeoutId);
  }, [inputValue, groups]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGroup();
    } else if (e.key === ' ' && inputValue.trim()) {
      e.preventDefault();
      addGroup();
    } else if (e.key === 'Backspace' && inputValue === '' && groups.length > 0) {
      removeGroup(groups.length - 1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const addGroup = (groupToAdd?: Group) => {
    let groupName = inputValue.trim();
    if (groupToAdd) {
      groupName = groupToAdd.name;
    }
    if (groupName && !groups.includes(groupName)) {
      // Validate group format if needed
      // if (groupName.startsWith('-') && !allowNegative) {
      //   return;
      // }
      onGroupsChange([...groups, groupName]);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const removeGroup = (index: number) => {
    onGroupsChange(groups.filter((_, i) => i !== index));
  };

  // const isExcludeGroup = (group: string) => group.startsWith('-');

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 p-3 bg-slate-800 border border-slate-700 rounded-lg focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 min-h-[50px] transition-all">
        {groups.map((group, index) => (
          <div
            key={index}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              // isExcludeGroup(group)
              //   ? 'bg-red-500/20 text-red-300 border border-red-500/50 hover:bg-red-500/30'
              //   : 
                  'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
            }`}
          >
            {/* {isExcludeGroup(group) && <Minus className="w-3 h-3" />} */}
            <Plus className="w-3 h-3" />
            <span>{group}</span>
            <button
              onClick={() => removeGroup(index)}
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
          placeholder={groups.length === 0 ? t('group.add') : ''}
          className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-400 min-w-[120px] py-1"
        />
        {inputValue && (
          <button
            onClick={() => addGroup()}
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
              <span className="ml-2 text-slate-400 text-sm">{t('file.searching')}</span>
            </div>
          )}
          {!loading && suggestions.map((suggestion, index) => {
            // const isNegative = inputValue.startsWith('-');
            // const suggestionText = isNegative ? `-${suggestion.name}` : suggestion.name;
            // const isAlreadyAdded = groups.includes(suggestionText);
            return (
              <button
                key={`${suggestion.id}-${index}`}
                onClick={() => addGroup(suggestion)}
                // disabled={isAlreadyAdded}
                className={`w-full px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center justify-between ${
                  // isAlreadyAdded
                  //   ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  //   : 
                      'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {/* {isNegative ? (
                    <Minus className="w-3 h-3 text-red-400" />
                  ) : ( */}
                    <Plus className="w-3 h-3 text-purple-400" />
                  {/* )} */}
                  <span>{suggestion.name}</span>
                </div>
                {/* <span className="text-xs text-slate-500">
                  {suggestion.usage_count || 0}
                </span> */}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
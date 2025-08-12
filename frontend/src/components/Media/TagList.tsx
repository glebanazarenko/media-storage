import React from 'react';
import { Tag, X } from 'lucide-react';

interface TagListProps {
  tags: string[];
  compact?: boolean;
  editable?: boolean;
  onTagClick?: (tag: string) => void;
  onTagRemove?: (tag: string) => void;
}

export const TagList: React.FC<TagListProps> = ({ 
  tags, 
  compact = false,
  editable = false,
  onTagClick,
  onTagRemove 
}) => {
  if (tags.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      {tags.map((tag, index) => (
        <span
          key={index}
          onClick={() => onTagClick?.(tag)}
          className={`inline-flex items-center space-x-1 bg-gray-700 text-gray-300 rounded-full transition-colors ${
            compact ? 'px-2 py-1' : 'px-3 py-1'
          } ${
            onTagClick ? 'hover:bg-gray-600 hover:text-white cursor-pointer' : ''
          }`}
        >
          <Tag className={`${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
          <span>{tag}</span>
          {editable && onTagRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTagRemove(tag);
              }}
              className="ml-1 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
};
import React from 'react';

interface RatingBadgeProps {
  rating: '0+' | '16+' | '18+';
  size?: 'sm' | 'md' | 'lg';
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({ rating, size = 'sm' }) => {
  const getColors = (rating: string) => {
    switch (rating) {
      case '0+':
        return 'bg-green-600 text-green-100';
      case '16+':
        return 'bg-yellow-600 text-yellow-100';
      case '18+':
        return 'bg-red-600 text-red-100';
      default:
        return 'bg-gray-600 text-gray-100';
    }
  };

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'md':
        return 'px-3 py-1 text-sm';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-2 py-1 text-xs';
    }
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${getColors(rating)} ${getSizeClasses(size)}`}
    >
      {rating}
    </span>
  );
};
import { useState, useEffect } from 'react';
import { MediaFile, SearchFilters } from '../types';

// Mock data generator for demonstration
const generateMockFile = (id: number): MediaFile => {
  const types = ['image/jpeg', 'image/png', 'video/mp4', 'video/webm'];
  const ratings: Array<'0+' | '16+' | '18+'> = ['0+', '16+', '18+'];
  const tags = [
    'landscape', 'portrait', 'nature', 'architecture', 'street',
    'digital-art', 'photography', 'video', 'animation', 'music',
    'black-and-white', 'color', 'documentary', 'tutorial', 'creative'
  ];

  const mimeType = types[Math.floor(Math.random() * types.length)];
  const isVideo = mimeType.startsWith('video/');
  
  return {
    id: `file-${id}`,
    originalName: `media-file-${id}.${mimeType.split('/')[1]}`,
    fileName: `media-file-${id}`,
    mimeType,
    size: Math.floor(Math.random() * 100000000) + 1000000, // 1MB to 100MB
    path: `/files/media-file-${id}`,
    thumbnailPath: `https://images.pexels.com/photos/${Math.floor(Math.random() * 1000) + 1}/pexels-photo-${Math.floor(Math.random() * 1000) + 1}.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop`,
    previewPath: isVideo ? `/previews/media-file-${id}-preview.webm` : undefined,
    description: Math.random() > 0.5 ? `Beautiful ${isVideo ? 'video' : 'image'} captured with professional equipment. High quality content suitable for various purposes.` : undefined,
    tags: tags.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 6) + 1),
    rating: ratings[Math.floor(Math.random() * ratings.length)],
    createdAt: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: 'user-1',
    owner: {
      id: 'user-1',
      username: 'demo_user',
      email: 'demo@example.com',
      role: 'user',
      createdAt: new Date().toISOString(),
    },
    dimensions: isVideo ? undefined : {
      width: Math.floor(Math.random() * 3000) + 1000,
      height: Math.floor(Math.random() * 3000) + 1000,
    },
    duration: isVideo ? Math.floor(Math.random() * 600) + 30 : undefined, // 30s to 10min
  };
};

export const useMediaFiles = () => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>({});

  // Generate mock data
  useEffect(() => {
    const mockFiles = Array.from({ length: 50 }, (_, i) => generateMockFile(i + 1));
    
    setTimeout(() => {
      setFiles(mockFiles);
      setLoading(false);
    }, 1000);
  }, []);

  const filteredFiles = files.filter(file => {
    // Search query filter
    if (filters.query) {
      const query = filters.query.toLowerCase();
      const matchesName = file.originalName.toLowerCase().includes(query);
      const matchesDescription = file.description?.toLowerCase().includes(query);
      const matchesTags = file.tags.some(tag => tag.toLowerCase().includes(query));
      
      if (!matchesName && !matchesDescription && !matchesTags) {
        return false;
      }
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every(tag => 
        file.tags.some(fileTag => fileTag.toLowerCase().includes(tag.toLowerCase()))
      );
      if (!hasAllTags) return false;
    }

    // Exclude tags filter
    if (filters.excludeTags && filters.excludeTags.length > 0) {
      const hasExcludedTag = filters.excludeTags.some(tag => 
        file.tags.some(fileTag => fileTag.toLowerCase().includes(tag.toLowerCase()))
      );
      if (hasExcludedTag) return false;
    }

    // Rating filter
    if (filters.rating && filters.rating.length > 0) {
      if (!filters.rating.includes(file.rating)) return false;
    }

    // File type filter
    if (filters.fileType && filters.fileType.length > 0) {
      const fileCategory = file.mimeType.split('/')[0];
      if (!filters.fileType.includes(fileCategory)) return false;
    }

    // Date range filter
    if (filters.dateFrom) {
      if (new Date(file.createdAt) < new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo) {
      if (new Date(file.createdAt) > new Date(filters.dateTo)) return false;
    }

    // Size filter
    if (filters.sizeMin && file.size < filters.sizeMin) return false;
    if (filters.sizeMax && file.size > filters.sizeMax) return false;

    return true;
  });

  // Sort files
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const { sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    
    let comparison = 0;
    switch (sortBy) {
      case 'createdAt':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'name':
        comparison = a.originalName.localeCompare(b.originalName);
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const addFiles = (newFiles: File[]) => {
    // In a real app, this would upload files to the server
    const mockNewFiles = newFiles.map((file, index) => ({
      ...generateMockFile(files.length + index + 1),
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    }));
    
    setFiles(prev => [...mockNewFiles, ...prev]);
  };

  const updateFilters = (newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const deleteFile = (fileId: string) => {
    setFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const updateFile = (fileId: string, updates: Partial<MediaFile>) => {
    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, ...updates } : file
    ));
  };

  return {
    files: sortedFiles,
    loading,
    filters,
    addFiles,
    updateFilters,
    deleteFile,
    updateFile,
  };
};
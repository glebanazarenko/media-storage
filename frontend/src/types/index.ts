export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  avatar?: string;
  createdAt: string;
}

export interface MediaFile {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  thumbnailPath?: string;
  previewPath?: string;
  description?: string;
  tags: string[];
  rating: '0+' | '16+' | '18+';
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner: User;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number; // for videos in seconds
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  owner: User;
  members: CollectionMember[];
  mediaFiles: MediaFile[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionMember {
  id: string;
  userId: string;
  user: User;
  role: 'editor' | 'viewer';
  joinedAt: string;
}

export interface SearchFilters {
  query?: string;
  tags?: string[];
  excludeTags?: string[];
  rating?: string[];
  fileType?: string[];
  dateFrom?: string;
  dateTo?: string;
  sizeMin?: number;
  sizeMax?: number;
  sortBy?: 'createdAt' | 'size' | 'name';
  sortOrder?: 'asc' | 'desc';
}
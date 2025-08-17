export interface User {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface FileItem {
  id: string;
  filename: string;
  description?: string;
  mime_type: string;
  file_path: string;
  file_size: number;
  category_name: '0+' | '16+' | '18+';
  tags: Tag[];
  created_at: string;
  updated_at: string;
  thumbnail_url?: string;
  owner_id: string;
  views_count?: number;
  downloads_count?: number;
}

export interface Tag {
  id: string;
  name: string;
  category?: string;
  usage_count?: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  files: FileItem[];
  owner_id: string;
  members: User[];
  created_at: string;
  is_private: boolean;
  file_count: number;
  thumbnail_url?: string;
}

export interface SearchFilters {
  category: 'all' | '0+' | '16+' | '18+';
  tags: string[];
  excludeTags: string[];
  dateFrom?: string;
  dateTo?: string;
  fileTypes: string[];
  minSize?: number;
  maxSize?: number;
  sortBy: 'date' | 'name' | 'size' | 'views' | 'downloads';
  sortOrder: 'asc' | 'desc';
}

export interface FileUploadData {
  file: File;
  description?: string;
  tags: string[];
  category: '0+' | '16+' | '18+';
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}
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
  transcoding_status?: 'pending' | 'processing' | 'completed' | 'failed';
  hls_manifest_path?: string;
  views_count?: number;
  downloads_count?: number;
  duration?: number | null;
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

// Интерфейс для члена группы
export interface GroupMember {
  user_id: string;
  group_id: string;
  role: 'reader' | 'editor' | 'admin';
  invited_by?: string;
  invited_at: string; // ISO string
  accepted_at?: string; // ISO string
  revoked_at?: string; // ISO string
}

// Интерфейс для группы (соответствует GroupResponse бэкенда)
export interface Group {
  id: string;
  name: string;
  description?: string;
  creator_id: string; // ID пользователя-создателя
  access_level: string; // reader, editor, admin (или просто admin для создателя)
  created_at: string; // ISO string
  updated_at: string; // ISO string
  // file_count и members не возвращаются в GroupResponse, нужно получать отдельно
  // thumbnail_url не возвращается, нужно генерировать или получать из файла
}
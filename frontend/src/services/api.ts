import axios from 'axios';
import { LoginCredentials, RegisterData, FileItem, SearchFilters } from '../types';

export const API_BASE_URL = 'https://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add authorization token
api.interceptors.request.use(
  (config) => {
    // Token is handled via cookies, so no need to add Authorization header manually
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Только если мы не на странице логина
      if (window.location.pathname !== '/login') {
        // Используем history API вместо прямого изменения location
        window.history.pushState(null, '', '/login');
        // Перезагружаем страницу только один раз
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  login: (credentials: LoginCredentials) => 
    api.post('/auth/login', credentials),
  
  register: (data: RegisterData) => 
    api.post('/auth/register', data),
  
  test: () => 
    api.post('/auth/test'),
  
  logout: () => 
    api.post('/auth/logout'),
};

// Files endpoints
export const filesAPI = {
  uploadFile: (formData: FormData) => 
    api.post('/files/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
  
  getFile: (fileId: string) => 
    api.get<FileItem>(`/files/${fileId}`),
  
  getFiles: (params?: Partial<SearchFilters & { 
    page?: number; 
    limit?: number; 
    search?: string;
  }>) => 
    api.get<{ files: FileItem[]; total: number; page: number; pages: number }>('/files/', { params }),
  
  deleteFile: (fileId: string) => 
    api.delete(`/files/${fileId}`),
  
  editFile: async (id: string, data: { 
    description?: string; 
    category?: string; 
    tagNames?: string; 
  }) => {
    const formData = new FormData();
    
    if (data.description !== undefined) {
      formData.append('description', data.description || '');
    }
    
    if (data.category) {
      formData.append('category', data.category);
    }
    
    if (data.tagNames) {
      formData.append('tag_names', data.tagNames);
    }

    return api.put(`/files/${id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  downloadFile: (fileId: string) => {
    window.open(`${API_BASE_URL}/files/${fileId}/download`, '_blank');
  },
  
  getFileStream: (fileId: string) => 
    api.get(`/files/${fileId}/stream`, { responseType: 'blob' }),

  getThumbnail: (thumbnail_path: string) => 
    api.get(`/files/${thumbnail_path}`),

  getPreview: (preview_path: string) => 
    api.get(`/files/preview/${preview_path}`),

  searchFiles: (params: {
    query?: string;
    category?: string;
    includeTags?: string;
    excludeTags?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) => 
    api.get<{ files: FileItem[]; total: number; page: number; limit: number }>('/files/search', { params }),
};

// Tags endpoints
export const tagsAPI = {
  getTags: (category?: string) => 
    api.get('/tags/', { params: { category } }),
  
  searchTags: (query: string, limit: number = 10) => 
    api.get(`/tags/search`, { params: { q: query, limit } }),
  
  getPopularTags: (limit: number = 20) => 
    api.get('/tags/popular', { params: { limit } }),
};

// Collections endpoints
export const collectionsAPI = {
  getCollections: () => 
    api.get('/collections/'),
  
  getCollection: (collectionId: string) => 
    api.get(`/collections/${collectionId}`),
  
  createCollection: (data: { name: string; description?: string; is_private?: boolean }) => 
    api.post('/collections/', data),
  
  updateCollection: (collectionId: string, data: any) => 
    api.patch(`/collections/${collectionId}`, data),
  
  deleteCollection: (collectionId: string) => 
    api.delete(`/collections/${collectionId}`),
  
  addFileToCollection: (collectionId: string, fileId: string) => 
    api.post(`/collections/${collectionId}/files/${fileId}`),
  
  removeFileFromCollection: (collectionId: string, fileId: string) => 
    api.delete(`/collections/${collectionId}/files/${fileId}`),
};

// User endpoints
export const usersAPI = {
  getProfile: () => 
    api.get('/auth/profile'),
  
  updateProfile: (data: any) => 
    api.patch('/auth/profile', data),
  
  getUsers: () => 
    api.get('/users/'),
  
  updateUser: (userId: string, data: any) => 
    api.patch(`/users/${userId}`, data),
};

export const backUpAPI = {
  downloadBackup: () => {
    return api.get('/backup/download', {
      responseType: 'blob'
    });
  },

  restoreBackup: (formData: FormData) => {
    return api.post('/backup/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }
};

export default api;
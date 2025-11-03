import axios from 'axios';
import { LoginCredentials, RegisterData, FileItem, SearchFilters, BackupFile, RestoreBackupRequest} from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL;

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
      // Сохраняем текущий URL только если мы не на публичных страницах
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const currentUrl = currentPath + currentSearch;
      
      if (!['/login', '/register'].includes(currentPath)) {
        sessionStorage.setItem('redirectAfterLogin', currentUrl);
      }
      
      // Только если мы не на странице логина
      if (currentPath !== '/login') {
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

  downloadFromUrl: (url: string) => 
    api.post('/files/download-from-url', { url }),
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

// Groups endpoints
export const groupsAPI = {
  getGroups: () => 
    api.get('/groups/'), // Возвращает список GroupResponse
  
  getGroup: (groupId: string) => 
    api.get(`/groups/${groupId}`), // Возвращает GroupResponse

  getGroupMembers: (groupId: string) =>
    api.get(`/groups/${groupId}/members`), // Возвращает GroupResponse
  
  createGroup: (data: { name: string; description?: string }) => 
    api.post('/groups/', data), // Принимает GroupCreate
  
  updateGroup: (groupId: string, data: { name?: string; description?: string }) => 
    api.put(`/groups/${groupId}`, data), // Принимает GroupUpdate
  
  deleteGroup: (groupId: string) => 
    api.delete(`/groups/${groupId}`),
  
  // Invite member (requires user ID)
  inviteMember: (groupId: string, data: { user_id: string; role: string }) => // role: 'reader', 'editor', 'admin'
    api.post(`/groups/${groupId}/members`, data),
  
  // Remove member
  removeMember: (groupId: string, userId: string) => 
    api.delete(`/groups/${groupId}/members/${userId}`),
  
  // Update member role
  updateMemberRole: (groupId: string, userId: string, data: { role: string }) => // role: 'reader', 'editor', 'admin'
    api.put(`/groups/${groupId}/members/${userId}/role`, data),
  
  // Get files in a group
  getGroupFiles: (groupId: string, params?: { sortBy?: string; sortOrder?: 'asc' | 'desc'; page?: number; limit?: number }) => 
    api.get<{ files: any[]; total: number; page: number; limit: number }>(`/groups/${groupId}/files`, { params }), // params как в /files/
  
  // Add file to group
  addFileToGroup: (groupId: string, fileId: string) => // Принимает объект { file_id: string }
    api.post(`/groups/${groupId}/files`, { file_id: fileId }),
  
  // Remove file from group
  removeFileFromGroup: (fileId: string) => 
    api.delete(`/files/${fileId}`),
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
  // Инициирует создание бэкапа для пользователя
  initiateBackup: () => {
    return api.get('/backup/download'); // Теперь возвращает { task_id: string, message: string }
  },
  // Инициирует создание полного бэкапа (для админов)
  initiateFullBackup: () => {
    return api.get('/backup/download-full'); // Теперь возвращает { task_id: string, message: string }
  },
  // Проверяет статус задачи по ID
  getBackupStatus: (taskId: string) => {
    return api.get(`/backup/status/${taskId}`); // Возвращает { task_id: string, status: 'pending' | 'in_progress' | 'completed' | 'failed', ... }
  },
  // Вызывает редирект на готовый бэкап по ID задачи
  downloadBackupByTaskId: (taskId: string) => {
    // Возвращаем URL для редиректа, а не делаем запрос напрямую, чтобы браузер обработал его
    // или используем window.location.assign
    return `${API_BASE_URL}/backup/download-task/${taskId}`;
  },
  listBackups: () => {
    return api.get<BackupFile[]>('/backup/list');
  },

  restoreBackupByS3Key: (request: RestoreBackupRequest) => {
    return api.post('/backup/restore-by-s3-key', request);
  },

  downloadBackupByS3Key: (s3Key: string) => {
    // Возвращаем URL для прямого скачивания
    return `${API_BASE_URL}/backup/download-by-s3-key/${encodeURIComponent(s3Key)}`;
  }
};

export default api;
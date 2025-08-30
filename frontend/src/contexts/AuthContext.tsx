import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginCredentials, RegisterData } from '../types';
import { authAPI, API_BASE_URL } from '../services/api';

interface AuthContextType {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await authAPI.test();
      if (response.data) {
        // Get full user profile
        const userResponse = await fetch(`${API_BASE_URL}/auth/profile`, {
          credentials: 'include'
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData);
        } else {
          // Fallback to basic user info from test endpoint
          setUser({
            id: '1',
            username: response.data?.username || 'user',
            email: 'user@example.com',
            is_active: true,
            is_admin: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authAPI.login(credentials);
      if (response.status === 200) {
        await checkAuthStatus();
        // После успешного логина проверяем сохраненный URL
        const savedUrl = sessionStorage.getItem('redirectAfterLogin');
        if (savedUrl) {
          sessionStorage.removeItem('redirectAfterLogin');
          // Используем replace чтобы не создавать новую запись в истории
          window.location.replace(savedUrl);
        }
      } else {
        throw new Error('Login failed');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  };

  const register = async (data: RegisterData): Promise<User> => {
    try {
      const response = await authAPI.register(data);
      const userData = response.data;
      setUser(userData);
      return userData;
    } catch (error: any) {
      console.error('Register error:', error);
      throw new Error(error.response?.data?.message || 'Registration failed');
    }
  };

  const logout = async () => {
    try {
      // Сохраняем текущий URL перед логаутом (но не для страниц логина/регистрации)
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const currentUrl = currentPath + currentSearch;
      
      if (!['/login', '/register'].includes(currentPath)) {
        sessionStorage.setItem('redirectAfterLogin', currentUrl);
      }
      
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      // Clear cookies
      document.cookie = 'Authorization=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      register, 
      logout, 
      loading,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
};
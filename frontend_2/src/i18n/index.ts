import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Navigation
      'nav.dashboard': 'Dashboard',
      'nav.upload': 'Upload',
      'nav.collections': 'Collections',
      'nav.search': 'Search',
      'nav.settings': 'Settings',
      'nav.logout': 'Logout',
      'nav.welcome': 'Welcome',
      
      // Auth
      'auth.login': 'Login',
      'auth.register': 'Register',
      'auth.username': 'Username',
      'auth.password': 'Password',
      'auth.email': 'Email',
      'auth.confirmPassword': 'Confirm Password',
      'auth.loginButton': 'Sign In',
      'auth.registerButton': 'Sign Up',
      'auth.noAccount': "Don't have an account?",
      'auth.hasAccount': 'Already have an account?',
      
      // Categories
      'category.all': 'All',
      'category.0+': '0+',
      'category.16+': '16+',
      'category.18+': '18+',
      
      // File management
      'file.upload': 'Upload File',
      'file.description': 'Description',
      'file.tags': 'Tags',
      'file.category': 'Category',
      'file.size': 'Size',
      'file.date': 'Date',
      'file.delete': 'Delete',
      'file.download': 'Download',
      'file.edit': 'Edit',
      
      // Search
      'search.placeholder': 'Search files...',
      'search.filters': 'Filters',
      'search.tags': 'Tags',
      'search.excludeTags': 'Exclude Tags',
      'search.dateFrom': 'Date From',
      'search.dateTo': 'Date To',
      'search.fileTypes': 'File Types',
      'search.sortBy': 'Sort By',
      'search.sortOrder': 'Sort Order',
      
      // Common
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.close': 'Close',
      'common.loading': 'Loading...',
      'common.error': 'Error',
      'common.success': 'Success',
      'common.name': 'Name',
      'common.date': 'Date',
      'common.size': 'Size',
    }
  },
  ru: {
    translation: {
      // Navigation
      'nav.dashboard': 'Главная',
      'nav.upload': 'Загрузить',
      'nav.collections': 'Коллекции',
      'nav.search': 'Поиск',
      'nav.settings': 'Настройки',
      'nav.logout': 'Выход',
      'nav.welcome': 'Добро пожаловать',
      
      // Auth
      'auth.login': 'Вход',
      'auth.register': 'Регистрация',
      'auth.username': 'Имя пользователя',
      'auth.password': 'Пароль',
      'auth.email': 'Email',
      'auth.confirmPassword': 'Подтвердите пароль',
      'auth.loginButton': 'Войти',
      'auth.registerButton': 'Зарегистрироваться',
      'auth.noAccount': 'Нет аккаунта?',
      'auth.hasAccount': 'Уже есть аккаунт?',
      
      // Categories
      'category.all': 'Все',
      'category.0+': '0+',
      'category.16+': '16+',
      'category.18+': '18+',
      
      // File management
      'file.upload': 'Загрузить файл',
      'file.description': 'Описание',
      'file.tags': 'Теги',
      'file.category': 'Категория',
      'file.size': 'Размер',
      'file.date': 'Дата',
      'file.delete': 'Удалить',
      'file.download': 'Скачать',
      'file.edit': 'Редактировать',
      
      // Search
      'search.placeholder': 'Поиск файлов...',
      'search.filters': 'Фильтры',
      'search.tags': 'Теги',
      'search.excludeTags': 'Исключить теги',
      'search.dateFrom': 'Дата с',
      'search.dateTo': 'Дата до',
      'search.fileTypes': 'Типы файлов',
      'search.sortBy': 'Сортировка',
      'search.sortOrder': 'Порядок сортировки',
      
      // Common
      'common.cancel': 'Отмена',
      'common.save': 'Сохранить',
      'common.close': 'Закрыть',
      'common.loading': 'Загрузка...',
      'common.error': 'Ошибка',
      'common.success': 'Успешно',
      'common.name': 'Название',
      'common.date': 'Дата',
      'common.size': 'Размер',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // ✅ Разрешаем проксирование с nginx
    allowedHosts: [
      'localhost',
      'frontend',  // ✅ Разрешаем хост "frontend"
      '127.0.0.1',
      '0.0.0.0',
    ],
  },
});
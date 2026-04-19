import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: '../app/static/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5030',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:5030',
        changeOrigin: true,
      },
      '/auth-center': {
        target: 'http://127.0.0.1:5030',
        changeOrigin: true,
      }
    }
  }
});

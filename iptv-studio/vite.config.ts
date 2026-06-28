import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    legacy({
      targets: ['defaults', 'not IE 11', 'iOS >= 11']
    })
  ],
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

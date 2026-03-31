import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No need for 'resolve' from 'path' unless you add path aliases later
export default defineConfig({
  plugins: [react()],
  base: '/jardesigner/',
  server: {
    proxy: {
      '^(?!/jardesigner).*': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
        rewriteWsOrigin: true,
      }
    }
  }
});

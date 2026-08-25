import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // When running `npm run dev` (plain Vite) alongside `vercel dev` for the
    // API, proxy /api to the Vercel dev server so the frontend can call the
    // same relative paths it uses in production. If you run `vercel dev`
    // directly instead, it serves both the built frontend and /api itself
    // and this proxy is unused.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});

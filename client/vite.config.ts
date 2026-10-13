import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tailwind runs through its Vite plugin. An inline (empty) PostCSS config stops Vite from
  // searching parent folders and picking up an unrelated postcss.config.js outside the repo.
  css: { postcss: { plugins: [] } },
  server: {
    port: 5173,
    // In development the API runs separately; proxying keeps the browser on one origin.
    proxy: { '/api': 'http://localhost:4000' },
  },
});

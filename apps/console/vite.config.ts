import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: {
    proxy: {
      '/admin': 'http://127.0.0.1:2555',
      '/catalog': 'http://127.0.0.1:2555',
      '/docs': 'http://127.0.0.1:2555',
      '/healthz': 'http://127.0.0.1:2555',
      '/models': 'http://127.0.0.1:2555',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{mjs,ts,tsx}'],
  },
});

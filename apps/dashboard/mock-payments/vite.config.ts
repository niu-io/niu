import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.NIU_MOCK_PAYMENT_UI_BASE || '/',
  root: new URL('.', import.meta.url).pathname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
  build: { outDir: 'dist', emptyOutDir: true },
});

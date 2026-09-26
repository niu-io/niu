import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { devAuth } from './dev-auth.ts';

const gateway = process.env.NIU_DEV_GATEWAY_URL ?? 'http://127.0.0.1:2566';

export default defineConfig({
  plugins: [devAuth(), react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: {
    proxy: {
      '/enterprise': gateway,
      '/v1': gateway,
      '/admin': gateway,
      '/catalog': gateway,
      '/docs': gateway,
      '/healthz': gateway,
      '/models': gateway,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{mjs,ts,tsx}'],
  },
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { devAuth } from './dev-auth.ts';

const gateway = process.env.NIU_DEV_GATEWAY_URL ?? 'http://127.0.0.1:2566';
const gatewayPaths = ['/enterprise', '/v1', '/admin', '/catalog', '/docs', '/healthz', '/models'];

export default defineConfig(({ command }) => {
  // NIU_DEV_BASE is for the loopback development server only. Production builds
  // always use the root path so a workstation tunnel path cannot leak to Render.
  const requestedBase = command === 'serve' ? process.env.NIU_DEV_BASE?.trim() || '/' : '/';
  const base = requestedBase.startsWith('/') ? requestedBase : `/${requestedBase}`;
  const publicBase = base.endsWith('/') ? base : `${base}/`;
  const basePrefix = publicBase === '/' ? '' : publicBase.slice(0, -1);
  const gatewayProxy = Object.fromEntries(gatewayPaths.flatMap(path => {
    const proxy = {
      target: gateway,
      rewrite: (requestPath: string) => requestPath.startsWith(`${basePrefix}/`)
        ? requestPath.slice(basePrefix.length)
        : requestPath,
    };
    return basePrefix
      ? [[path, proxy], [`${basePrefix}${path}`, proxy]]
      : [[path, proxy]];
  }));

  return {
    base: publicBase,
    plugins: [devAuth(), react(), tailwindcss()],
    resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
    server: {
      proxy: gatewayProxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{mjs,ts,tsx}'],
    },
  };
});

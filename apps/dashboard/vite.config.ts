import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { loadEnv } from 'vite';

const gateway = process.env.NIU_DEV_GATEWAY_URL ?? 'http://127.0.0.1:2566';
const gatewayPaths = ['/auth/callback', '/enterprise', '/v1', '/admin/v1', '/catalog', '/docs', '/healthz', '/readyz', '/models', '/__niu_dev', '/catalog-assets', '/_catalog', '/favicon.ico'];

export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    const local = loadEnv(mode, process.cwd(), 'NIU_DEV_');
    for (const name of ['NIU_DEV_USERNAME', 'NIU_DEV_PASSWORD']) {
      if (local[name] && !process.env[name]) process.env[name] = local[name];
    }
  }
  // NIU_DEV_BASE is for the loopback development server only. Production builds
  // always use the root path so a workstation tunnel path cannot leak to Render.
  const requestedBase = command === 'serve' ? process.env.NIU_DEV_BASE?.trim() || '/' : '/';
  const base = requestedBase.startsWith('/') ? requestedBase : `/${requestedBase}`;
  const publicBase = base.endsWith('/') ? base : `${base}/`;
  const basePrefix = publicBase === '/' ? '' : publicBase.slice(0, -1);
  const gatewayProxy = Object.fromEntries(gatewayPaths.flatMap(path => {
    const proxy = {
      target: gateway,
      bypass: path === '/models' ? (request: import('node:http').IncomingMessage) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        return url.searchParams.get('workspace') ? request.url : undefined;
      } : undefined,
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
    // Open tabs may still request lazy chunks from the previous local build.
    // Keep those immutable assets when the managed development watcher rebuilds.
    build: { emptyOutDir: process.env.NIU_DEV_PRESERVE_ASSETS !== '1' },
    plugins: [react(), tailwindcss()],
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

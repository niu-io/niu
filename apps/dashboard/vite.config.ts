import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { loadEnv } from 'vite';

const gateway = process.env.NIU_DEV_GATEWAY_URL ?? 'http://127.0.0.1:2566';
const gatewayPaths = ['/auth/callback', '/enterprise', '/v1', '/v1beta', '/api/v1', '/api/plugins/v1', '/admin/v1', '/catalog', '/docs', '/compare', '/healthz', '/readyz', '/models', '/__niu_dev', '/catalog-assets', '/_catalog', '/_astro', '/site-assets', '/favicon.ico', '/robots.txt', '/sitemap.xml'];

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
      cookiePathRewrite: basePrefix ? publicBase : undefined,
      bypass: path === '/models' ? (request: import('node:http').IncomingMessage) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        return url.searchParams.get('workspace') ? request.url : undefined;
      } : undefined,
      rewrite: (requestPath: string) => {
        const unprefixed = requestPath.startsWith(`${basePrefix}/`)
          ? requestPath.slice(basePrefix.length)
          : requestPath;
        // Community development has no website artifact. Use the docs-owned
        // comparison directly, including with an older running Gateway binary.
        return path === '/compare' && !process.env.NIU_SITE_DIR?.trim()
          ? `/docs${unprefixed}`
          : unprefixed;
      },
    };
    return basePrefix
      ? [[path, proxy], [`${basePrefix}${path}`, proxy]]
      : [[path, proxy]];
  }));

  const isVitest = Boolean(process.env.VITEST) || mode === 'test';

  return {
    base: publicBase,
    // Open tabs may still request lazy chunks from the previous local build.
    // Keep those immutable assets when the managed development watcher rebuilds.
    build: { emptyOutDir: process.env.NIU_DEV_PRESERVE_ASSETS !== '1' },
    plugins: [isVitest ? react() : reactRouter(), tailwindcss()],
    resolve: {
      alias: [
        ...(isVitest
          ? [
              {
                find: /(?:@|(?:\.\.\/)+app)\/routes$/,
                replacement: new URL('./app/router-tree.tsx', import.meta.url).pathname,
              },
            ]
          : []),
        { find: '@', replacement: new URL('./app', import.meta.url).pathname },
      ],
    },
    server: {
      // The mount root may redirect to the dashboard, so keep HMR on its own path.
      ws: basePrefix ? { path: '__hmr' } : undefined,
      proxy: gatewayProxy,
    },
    // React Router's SPA prerender connects to Vite's local preview server.
    // Use an explicit loopback address so the listener and build client agree
    // in container environments with different localhost resolution behavior.
    preview: { host: '127.0.0.1' },
    test: {
      pool: 'threads',
      maxWorkers: 2,
      testTimeout: 15000,
      hookTimeout: 15000,
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{mjs,ts,tsx}'],
    },
  };
});

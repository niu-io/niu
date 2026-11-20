import { cpSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '@react-router/dev/config';

const isServe = !process.argv.some(arg => arg === 'build');
const requestedBase = isServe ? process.env.NIU_DEV_BASE?.trim() || '/' : '/';
const normalizedBase = requestedBase.startsWith('/') ? requestedBase : `/${requestedBase}`;
const basename = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;

export default {
  appDirectory: 'app',
  basename,
  buildDirectory: 'dist',
  ssr: false,
  buildEnd({ reactRouterConfig }) {
    const clientDir = path.join(reactRouterConfig.buildDirectory, 'client');
    if (!existsSync(clientDir)) return;
    for (const entry of readdirSync(clientDir)) {
      cpSync(
        path.join(clientDir, entry),
        path.join(reactRouterConfig.buildDirectory, entry),
        { recursive: true, force: true },
      );
    }
    // The gateway serves index.html. Current SPA builds emit __spa-fallback.html;
    // always replace the entry even when immutable assets are retained locally.
    const fallback = path.join(clientDir, '__spa-fallback.html');
    if (existsSync(fallback)) cpSync(fallback, path.join(reactRouterConfig.buildDirectory, 'index.html'));
  },
} satisfies Config;

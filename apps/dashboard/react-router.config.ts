import { cpSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
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
  },
} satisfies Config;

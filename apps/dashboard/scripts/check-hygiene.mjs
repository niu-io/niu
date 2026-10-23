import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const errors = [];

if (existsSync(join(root, 'src/lib/useRead.ts'))) {
  errors.push('src/lib/useRead.ts must remain removed (dead hook).');
}

let requestDefinitions = 0;
for (const file of [...walk(join(root, 'src')), ...walk(join(root, 'test'))]) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');
  if (/from\s+['"]cn['"]/.test(text)) {
    errors.push(`${rel}: imports external 'cn' package instead of '@/lib/utils'.`);
  }
  if (/sdks\/javascript\/src\//.test(text)) {
    errors.push(`${rel}: imports relative SDK source instead of '@niu-io/sdk'.`);
  }
  if (rel.startsWith('src/') && /\.catch\(\([^)]*\)\s*=>\s*\{\s*\}\)/.test(text)) {
    errors.push(`${rel}: contains an uncommented empty .catch(() => {}) block.`);
  }
  if (/export\s+async\s+function\s+request\s*</.test(text)) {
    requestDefinitions += 1;
    if (rel !== 'src/lib/api-client.ts') {
      errors.push(`${rel}: defines duplicate request<T> helper outside src/lib/api-client.ts.`);
    }
  }
}

if (requestDefinitions !== 1) {
  errors.push(`Expected exactly 1 request<T> definition in src/lib/api-client.ts, found ${requestDefinitions}.`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

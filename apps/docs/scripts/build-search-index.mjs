#!/usr/bin/env node
/** Build one language-consistent index so Chinese queries tokenize correctly. */
import * as pagefind from 'pagefind';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const { index, errors } = await pagefind.createIndex({ forceLanguage: 'zh' });
try {
  if (errors.length) throw new Error(errors.join('; '));
  const added = await index.addDirectory({ path: dist });
  if (added.errors.length) throw new Error(added.errors.join('; '));
  const written = await index.writeFiles({ outputPath: fileURLToPath(new URL('pagefind/', new URL('../dist/', import.meta.url))) });
  if (written.errors.length) throw new Error(written.errors.join('; '));
  console.log(`Pagefind zh index: ${added.page_count} pages`);
} finally {
  await pagefind.close();
}

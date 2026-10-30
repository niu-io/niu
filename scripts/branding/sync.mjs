/** Publish generated artwork to the public apps' existing asset contracts. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const docsRequire = createRequire(path.join(root, 'apps/docs/package.json'));
const sharp = createRequire(docsRequire.resolve('astro/package.json'))('sharp');
const kit = path.join(root, 'branding/rounded');
const manifest = JSON.parse(await readFile(path.join(kit, 'manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = new Set();
async function emit(destination, bytes) {
  await mkdir(path.dirname(path.join(root, destination)), { recursive: true });
  await writeFile(path.join(root, destination), bytes); output.add(destination);
}
async function asset(source, destinations) {
  const record = manifest.assets.find(entry => entry.file === source);
  assert(record, `Missing generated asset: ${source}`);
  const bytes = await readFile(path.join(kit, source)); assert.equal(hash(bytes), record.sha256);
  for (const destination of destinations) await emit(destination, bytes);
}
await asset('png/niu-mark-color.png', ['branding/assets/niu-mark.png']);
await asset('svg/niu-mark-color.svg', ['branding/assets/niu-mark.svg']);
await asset('png/niu-lockup-en-on-dark@2x.png', ['branding/assets/niu-logo-dark.png']);
const light = await readFile(path.join(kit, 'png/niu-lockup-en-on-light@2x.png'));
await emit('branding/assets/niu-logo.jpg', await sharp(light).flatten({ background: '#FAFAF9' }).jpeg({ quality: 95 }).toBuffer());
await asset('icons/favicon.ico', ['branding/assets/favicon.ico', 'apps/docs/public/favicon.ico']);
for (const language of ['en', 'zh']) for (const surface of ['light', 'dark']) {
  const name = `niu-lockup${language === 'en' ? '-en' : ''}-on-${surface}.svg`;
  await asset(`svg/${name}`, [`branding/assets/${name}`]);
}
await asset('png/niu-social-en-dark-1200x630.png', [
  'branding/assets/niu-social-en-dark.png', 'apps/docs/public/niu-logo-dark.png',
  'apps/docs/public/niu-social-en-dark.png', 'apps/docs/src/assets/niu-logo-dark.png',
]);
for (const app of ['dashboard', 'docs', 'catalog']) {
  for (const name of ['MAPLE-MONO-OFL', 'OPEN-HUNINN-OFL', 'SOURCE-LICENSE']) {
    const bytes = await readFile(path.join(kit, `sources/${name}.txt`));
    await emit(`apps/${app}/public/licenses/brand-${name.toLowerCase()}.txt`, bytes);
  }
}
const legacyPath = path.join(root, 'branding/manifest.json');
const legacy = JSON.parse(await readFile(legacyPath, 'utf8'));
const tracked = new Set(legacy.files.map(file => file.destination));
for (const destination of [...output].filter(file => file.startsWith('branding/assets/'))) {
  const sha256 = hash(await readFile(path.join(root, destination)));
  const existing = legacy.files.find(file => file.destination === destination);
  if (existing) existing.sha256 = sha256;
  else { legacy.files.push({ destination, sha256 }); tracked.add(destination); }
}
if (!tracked.has('branding/reference/niu-mark-original.png')) legacy.files.push({ destination: 'branding/reference/niu-mark-original.png', sha256: hash(await readFile(path.join(root, 'branding/reference/niu-mark-original.png'))) });
for (const entry of legacy.files) entry.sha256 = hash(await readFile(path.join(root, entry.destination)));
legacy.updated_on = '2026-10-30';
await writeFile(legacyPath, JSON.stringify(legacy, null, 2) + '\n');
console.log(`Synchronized ${output.size} canonical and packaged brand files.`);

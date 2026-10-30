/** Validate distributable integrity, portability and raster geometry. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'branding/rounded');
const docsRequire = createRequire(path.join(root, 'apps/docs/package.json'));
const sharp = createRequire(docsRequire.resolve('astro/package.json'))('sharp');
const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
assert.equal(manifest.assets.length, 79);
assert.equal(new Set(manifest.assets.map(a => a.file)).size, manifest.assets.length);
for (const entry of [...manifest.sources, ...manifest.assets]) {
  assert(!path.isAbsolute(entry.file) && !entry.file.split('/').includes('..'));
  const bytes = await readFile(path.join(out, entry.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.file);
  if (entry.bytes) assert.equal(bytes.length, entry.bytes, entry.file);
  if (entry.format === 'png') {
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, entry.width, entry.file);
    assert.equal(info.height, entry.height, entry.file);
    let visible = 0, transparent = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i]) visible++; if (data[i] < 255) transparent++; }
    assert(visible > 0, `Empty image: ${entry.file}`);
    assert.equal(transparent > 0, entry.transparent, `Transparency: ${entry.file}`);
    if (entry.transparent) {
      for (const p of [0, info.width - 1, (info.height - 1) * info.width, info.height * info.width - 1])
        assert.equal(data[p * 4 + 3], 0, `Clipped corner: ${entry.file}`);
    }
  }
  if (entry.format === 'svg') {
    const source = bytes.toString();
    assert(source.includes('<title>') && source.includes('viewBox='), entry.file);
    assert(!/<(?:text|image|script|foreignObject)\b|(?:href|src)=|font-family|@import/.test(source), `Non-portable SVG: ${entry.file}`);
  }
  if (entry.format === 'ico') {
    assert.equal(bytes.readUInt16LE(0), 0); assert.equal(bytes.readUInt16LE(2), 1);
    assert.equal(bytes.readUInt16LE(4), entry.sizes.length);
    for (let i = 0; i < entry.sizes.length; i++) {
      const at = 6 + i * 16, length = bytes.readUInt32LE(at + 8), offset = bytes.readUInt32LE(at + 12);
      assert(offset + length <= bytes.length);
      const meta = await sharp(bytes.subarray(offset, offset + length)).metadata();
      assert.equal(meta.width, entry.sizes[i]); assert.equal(meta.height, entry.sizes[i]);
    }
  }
}
// Verify tracing against the canonical silhouette at original resolution.
const original = await sharp(path.join(root, 'branding/reference/niu-mark-original.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const traced = await sharp(path.join(out, 'svg/niu-mark-color.svg')).resize(original.info.width, original.info.height).ensureAlpha().raw().toBuffer();
let intersection = 0, union = 0;
for (let i = 3; i < original.data.length; i += 4) {
  const a = original.data[i] >= 220, b = traced[i] >= 128;
  if (a && b) intersection++; if (a || b) union++;
}
const iou = intersection / union;
assert(iou > 0.985, `Original mark silhouette changed: ${iou}`);
const blades = JSON.parse(await readFile(path.join(out, 'sources/mark-paths.json'), 'utf8'));
assert.equal(blades.blades.length, 7);
const lettering = JSON.parse(await readFile(path.join(out, 'sources/lettering.json'), 'utf8'));
assert.deepEqual(lettering.latin.map(glyph => glyph.character), ['N', 'i', 'u']);
assert.deepEqual(lettering.chinese.map(glyph => glyph.character), ['牛', '元']);
assert(lettering.latin.every(glyph => glyph.advance === lettering.latinAdvance));
assert.equal(lettering.fonts.length, 2);
for (const font of lettering.fonts) {
  assert(manifest.sources.some(source => source.file === `sources/${font.license}`));
  assert.match(font.sha256, /^[a-f0-9]{64}$/);
}
console.log(`Verified ${manifest.assets.length} assets and ${manifest.sources.length} sources; silhouette overlap ${(iou * 100).toFixed(2)}%; PNG alpha, SVG portability, and all 6 ICO entries valid.`);

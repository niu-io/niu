/** Rebuild the approved rounded brand kit from portable vector geometry. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'branding/rounded');
// Reuse the image renderer supplied by the lockfile-pinned docs build.
const docsRequire = createRequire(path.join(root, 'apps/docs/package.json'));
const sharp = createRequire(docsRequire.resolve('astro/package.json'))('sharp');
const geometry = JSON.parse(await readFile(path.join(out, 'sources/mark-paths.json'), 'utf8'));
const lettering = JSON.parse(await readFile(path.join(out, 'sources/lettering.json'), 'utf8'));
const palette = {
  gold: '#FFC857', amber: '#FFB547', tangerine: '#FF914D',
  orange: '#FF7A36', coral: '#F87863', salmon: '#FF8A75', marigold: '#FFB52E',
  ink: '#202124', white: '#F7F7F8', dark: '#121314', light: '#FAFAF9',
};
const colors = ['gold', 'amber', 'tangerine', 'orange', 'coral', 'salmon', 'marigold'];
const xml = (w, h, body, title = 'Niu 牛元') => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
function mark(size, tone = 'color', x = 0, y = 0) {
  return `<g transform="translate(${x} ${y}) scale(${size / geometry.viewBox[2]})">${geometry.blades.map((d, i) => `<path fill="${tone === 'color' ? palette[colors[i]] : tone}" d="${d}"/>`).join('')}</g>`;
}
function word(color, bilingual = true, x = 0, y = 0, scale = 1) {
  const latin = lettering.latin.map(({ path }) => `<path d="${path}"/>`).join('');
  const chinese = bilingual ? `<g transform="translate(${lettering.chineseOffset.x} ${lettering.chineseOffset.y})" stroke="${color}" stroke-width="${lettering.chineseStrokeWidth}" stroke-linejoin="round">${lettering.chinese.map(({ path }) => `<path d="${path}"/>`).join('')}</g>` : '';
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}">${latin}${chinese}</g>`;
}

const placement = lettering.lockupPlacement;
const assets = [];
for (const folder of ['svg', 'png', 'icons', 'preview']) await mkdir(path.join(out, folder), { recursive: true });
async function svgAsset(name, w, h, body, raster = true) {
  const svg = xml(w, h, body, name.includes('-en-') || name.startsWith('niu-mark-') ? 'Niu' : 'Niu 牛元');
  await writeFile(path.join(out, 'svg', `${name}.svg`), svg);
  assets.push({ file: `svg/${name}.svg`, width: w, height: h, format: 'svg', transparent: true });
  if (raster) for (const scale of [1, 2]) {
    const file = `png/${name}${scale === 2 ? '@2x' : ''}.png`;
    await sharp(Buffer.from(svg), { density: 72 * scale }).resize(w * scale, h * scale).png().toFile(path.join(out, file));
    assets.push({ file, width: w * scale, height: h * scale, format: 'png', transparent: true });
  }
}
for (const [name, color] of [['color', 'color'], ['ink', palette.ink], ['white', palette.white]]) {
  await svgAsset(`niu-mark-${name}`, 512, 512, mark(512, color));
}
for (const [surface, foreground, tone] of [
  ['on-dark', palette.white, 'color'], ['on-light', palette.ink, 'color'],
  ['mono-ink', palette.ink, palette.ink], ['mono-white', palette.white, palette.white],
]) {
  await svgAsset(`niu-lockup-${surface}`, 506, 128, mark(128, tone) + word(foreground, true, placement.x, placement.y, placement.scale));
  await svgAsset(`niu-lockup-en-${surface}`, 312, 128, mark(128, tone) + word(foreground, false, placement.x, placement.y, placement.scale));
  await svgAsset(`niu-stacked-${surface}`, 400, 320, mark(208, tone, 96, 2) + word(foreground, true, 28, 225, 0.8));
}
for (const [surface, color] of [['on-dark', palette.white], ['on-light', palette.ink]]) {
  await svgAsset(`niu-wordmark-${surface}`, 448, 112, word(color, true, 4, 4));
}
for (const [surface, color] of [['on-dark', palette.white], ['on-light', palette.ink]]) {
  await svgAsset(`niu-wordmark-en-${surface}`, 208, 112, word(color, false, 4, 4));
}
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  const file = `icons/favicon-${size}.png`;
  await sharp(Buffer.from(xml(size, size, mark(size)))).png().toFile(path.join(out, file));
  assets.push({ file, width: size, height: size, format: 'png', transparent: true });
}
// ICO embeds PNG entries (supported by modern Windows and browsers).
const iconSizes = [16, 32, 48, 64, 128, 256];
const iconImages = await Promise.all(iconSizes.map(size => readFile(path.join(out, `icons/favicon-${size}.png`))));
const directory = Buffer.alloc(6 + 16 * iconSizes.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(iconSizes.length, 4);
let offset = directory.length;
iconSizes.forEach((size, i) => {
  const p = 6 + 16 * i; directory[p] = size === 256 ? 0 : size; directory[p + 1] = directory[p];
  directory.writeUInt16LE(1, p + 4); directory.writeUInt16LE(32, p + 6);
  directory.writeUInt32LE(iconImages[i].length, p + 8); directory.writeUInt32LE(offset, p + 12); offset += iconImages[i].length;
});
await writeFile(path.join(out, 'icons/favicon.ico'), Buffer.concat([directory, ...iconImages]));
assets.push({ file: 'icons/favicon.ico', format: 'ico', sizes: iconSizes, transparent: true });
for (const [name, size] of [['apple-touch-icon', 180], ['app-icon-192', 192], ['app-icon-512', 512], ['avatar-1024', 1024]]) {
  const file = `icons/${name}.png`;
  const svg = xml(size, size, `<rect width="${size}" height="${size}" fill="${palette.dark}"/>` + mark(size * 0.88, 'color', size * 0.06, size * 0.06));
  await sharp(Buffer.from(svg)).png().toFile(path.join(out, file));
  assets.push({ file, width: size, height: size, format: 'png', transparent: false });
}
for (const language of ['en', 'zh']) for (const surface of ['dark', 'light']) {
  const bilingual = language === 'zh';
  const suffix = bilingual ? '' : '-en';
  const bg = palette[surface], fg = surface === 'dark' ? palette.white : palette.ink;
  const file = `png/niu-social${suffix}-${surface}-1200x630.png`;
  const width = bilingual ? 506 : 312;
  const svg = xml(1200, 630, `<rect width="1200" height="630" fill="${bg}"/>` + `<g transform="translate(${(1200 - width * 1.6) / 2} 213) scale(1.6)">${mark(128)}${word(fg, bilingual, placement.x, placement.y, placement.scale)}</g>`, bilingual ? 'Niu 牛元' : 'Niu');
  await writeFile(path.join(out, 'svg', `niu-social${suffix}-${surface}.svg`), svg);
  assets.push({ file: `svg/niu-social${suffix}-${surface}.svg`, width: 1200, height: 630, format: 'svg', transparent: false });
  await sharp(Buffer.from(svg)).png().toFile(path.join(out, file));
  assets.push({ file, width: 1200, height: 630, format: 'png', transparent: false });
}
// Preview sheets use the exact same vector geometry as the deliverables.
for (const surface of ['dark', 'light']) {
  const bg = palette[surface], fg = surface === 'dark' ? palette.white : palette.ink;
  let body = `<rect width="1200" height="1000" fill="${bg}"/>`;
  body += `<g transform="translate(80 64) scale(1.7)">${mark(128)}${word(fg, true, placement.x, placement.y, placement.scale)}</g>`;
  body += mark(192, 'color', 64, 365) + mark(192, fg, 300, 365);
  body += `<g transform="translate(604 384)">${word(fg, true, 0, 0, 1.15)}</g>`;
  body += `<g transform="translate(72 704) scale(0.5)">${mark(128)}${word(fg, true, placement.x, placement.y, placement.scale)}</g>`;
  body += `<g transform="translate(72 808) scale(0.375)">${mark(128)}${word(fg, true, placement.x, placement.y, placement.scale)}</g>`;
  for (const [i, size] of [16, 24, 32, 48, 64].entries()) body += mark(size, 'color', 600 + i * 100, 735);
  for (const [i, key] of colors.entries()) body += `<rect x="${604 + i * 70}" y="860" width="48" height="48" rx="12" fill="${palette[key]}"/>`;
  const file = `preview/niu-brand-sheet-${surface}.png`;
  await sharp(Buffer.from(xml(1200, 1000, body))).png().toFile(path.join(out, file));
  assets.push({ file, width: 1200, height: 1000, format: 'png', transparent: false });
}
for (const asset of assets) {
  const bytes = await readFile(path.join(out, asset.file));
  asset.sha256 = createHash('sha256').update(bytes).digest('hex');
  asset.bytes = bytes.length;
}
const sources = [];
for (const file of (await readdir(path.join(out, 'sources'))).sort()) {
  const bytes = await readFile(path.join(out, 'sources', file));
  sources.push({ file: `sources/${file}`, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(out, 'manifest.json'), JSON.stringify({ version: 1, brand: 'Niu 牛元', palette, sources, assets }, null, 2) + '\n');
console.log(`Exported ${assets.length} assets to branding/rounded/ (Sharp ${sharp.versions.sharp}).`);

# Niu rounded brand kit

This kit implements the approved bright warm palette, Maple Mono SemiBold (600) Latin
lettering and Open Huninn rounded Chinese lettering. The product name is **Niu**;
the bilingual wordmark is **Niu 牛元**.

## Choose an asset

| Use | Files | Export sizes |
| --- | --- | --- |
| Standalone color mark | `svg/niu-mark-color.svg`, `png/niu-mark-color.png` | 512 and 1024 px |
| Bilingual horizontal logo | `svg/niu-lockup-on-dark.svg`, `svg/niu-lockup-on-light.svg` | 506 × 128; PNG also at 2× |
| English horizontal logo | `svg/niu-lockup-en-on-dark.svg`, `svg/niu-lockup-en-on-light.svg` | 312 × 128; PNG also at 2× |
| Stacked bilingual logo | `svg/niu-stacked-on-dark.svg`, `svg/niu-stacked-on-light.svg` | 400 × 320; PNG also at 2× |
| English lettering without the mark | `svg/niu-wordmark-en-on-dark.svg`, `svg/niu-wordmark-en-on-light.svg` | 208 × 112; PNG also at 2× |
| Lettering without the mark | `svg/niu-wordmark-on-dark.svg`, `svg/niu-wordmark-on-light.svg` | 448 × 112; PNG also at 2× |
| Single-color artwork | `*-mono-ink.svg`, `*-mono-white.svg`; `niu-mark-ink.svg`, `niu-mark-white.svg` | Same geometry as color versions |
| Browser favicon | `icons/favicon.ico`, `icons/favicon-*.png` | ICO: 16, 32, 48, 64, 128, 256 px; PNG also 24 px |
| Apple touch icon | `icons/apple-touch-icon.png` | 180 × 180, opaque dark background |
| Application icons | `icons/app-icon-192.png`, `icons/app-icon-512.png` | Opaque square canvas |
| Avatar | `icons/avatar-1024.png` | 1024 × 1024, opaque dark background |
| English social sharing | `svg/niu-social-en-dark.svg`, `svg/niu-social-en-light.svg`, `png/niu-social-en-*-1200x630.png` | 1200 × 630 |
| Bilingual social sharing | `svg/niu-social-dark.svg`, `svg/niu-social-light.svg`, `png/niu-social-*-1200x630.png` | 1200 × 630 |
| Visual overview | `preview/niu-brand-sheet-dark.png`, `preview/niu-brand-sheet-light.png` | 1200 × 1000 |

SVG files are the scalable masters. Every non-social SVG also has transparent
PNG exports in `png/`; `@2x` means twice the listed width and height. `on-dark`
means light lettering **for placement on a dark surface**, not a baked-in dark
background. `on-light` means dark lettering for a light surface. Only social
cards, application/touch icons, avatars and preview sheets contain backgrounds.

Keep the native aspect ratio. Do not stretch, rotate, add shadows or outline the
mark. Leave at least one-quarter of the displayed mark canvas clear around the
lockup. Prefer SVG for product headers; a horizontal lockup height of 40–48 CSS
pixels keeps the Chinese lettering readable. Use the standalone mark where a
lockup will not fit. At tiny sizes or on low-contrast surfaces, prefer the
single-color version. These drawings are brand artwork, not UI status indicators.
Application platforms should apply their own icon mask to the square icon files.

## Palette

The seven blades retain their original order and use solid fills to avoid dark
gradient endpoints disappearing on dark surfaces.

| Blade, clockwise from upper left | Color |
| --- | --- |
| Gold | `#FFC857` |
| Amber | `#FFB547` |
| Tangerine | `#FF914D` |
| Orange | `#FF7A36` |
| Coral | `#F87863` |
| Salmon | `#FF8A75` |
| Marigold | `#FFB52E` |

Lettering uses `#F7F7F8` on dark surfaces and `#202124` on light surfaces. Preview
backgrounds are `#121314` and `#FAFAF9`. This palette belongs to the artwork; it
does not replace the shared product theme tokens in `../tokens.css`.

## Typography and editable sources

- `sources/mark-paths.json`: seven closed vector contours traced from the existing
  `branding/reference/niu-mark-original.png`. The trace uses the seven large connected regions
  at alpha ≥ 220, simplifies at 1.15 source pixels, and smooths adjacent vertices.
  Stray transparent-edge pixels are excluded. It retains the original blade
  silhouettes and orientation instead of retracing an AI-generated preview.
- `sources/lettering.json`: actual outlines from **Maple Mono SemiBold (600) v7.9** and
  **Open Huninn v2.1 (Open 粉圓)**. Latin letters retain equal 66-unit advances
  at a font size of 110. Chinese uses a size of 108, an optical baseline offset
  and a 2.4-unit round stroke for balanced weight. This replaces the rejected
  hand-drawn lettering. It is a rounded Chinese typeface, not Microsoft's YouYuan.
  The file records pinned release URLs, original font-file hashes and font sizes.
- `sources/MAPLE-MONO-OFL.txt` and `sources/OPEN-HUNINN-OFL.txt`: upstream font
  copyright and SIL Open Font License notices, retained verbatim. The distributable
  logos contain vector outlines, not font binaries, and need no installed fonts.
- `sources/SOURCE-LICENSE.txt`: original artwork attribution, retained verbatim.
- `LICENSE.txt`: repository MIT notice for the kit tooling and original contributions.
  Retain the artwork attribution and both upstream font notices when distributing
  the complete package. The original source notice continues to apply to the mark.

The generated concept images were visual direction only. They are not embedded
in these deliverables. The public apps now consume the approved artwork. Shared `NiuBrand` renders
English-only lettering in English and the bilingual lockup in Chinese, with
foreground inherited from the surrounding theme. Compact product-rail, loading
and mobile-entry positions retain the standalone mark. Tenant names, uploaded
logos and favicons remain overrides. The independent website snapshots the public
renderer and vector sources without a build-time dependency on another checkout.

## Rebuild and verify

From the repository root, with the lockfile-pinned workspace packages installed:

```sh
node scripts/branding/export.mjs
node scripts/branding/verify.mjs
node scripts/branding/sync.mjs
node apps/catalog/scripts/sync-brand.mjs
python3 scripts/branding/archive.py
```

The exporter uses Sharp from the installed Astro docs dependency tree. It needs
no fonts, network access or image-generation service. `manifest.json` records the
palette, dimensions, transparency, byte size and SHA-256 of all 79 deliverables,
plus source checksums. Update source geometry first, then rebuild; do not edit
individual PNGs. The kit manifest is separate from the legacy
`branding/manifest.json`, which records the synchronized canonical runtime assets.

The two preview sheets show the actual exported geometry on light and dark
surfaces, plus 64/48-pixel lockups and 16/24/32/48/64-pixel marks. They are visual
asset checks, not evidence of integration into the running product UI.

The archive command creates `branding/niu-rounded-brand-kit.zip` from the declared
assets and notices, with stable timestamps. It includes the kit README and vector
sources, but no unrelated repository files. Rebuild it after changing the kit.

To reproduce the font-to-path conversion on macOS, obtain the pinned upstream
font files listed in `sources/lettering.json` and verify their SHA-256 values.
Run `swift scripts/branding/outline-fonts.swift <MapleMono-SemiBold.ttf> <jf-openhuninn-2.1.ttf>`.
The tool uses Core Text to extract the original outlines; it does not synthesize
replacement letter shapes. Its JSON contains glyph paths, advances and PostScript
font names. Preserve the documented optical offsets and weight when updating
`lettering.json`, then run the normal export and archive commands above. Font
files and Core Text are unnecessary for ordinary asset rebuilds from the checked-in
outlines.

## Product integration

`node scripts/branding/sync.mjs` copies the approved mark, English fallback
wordmark, favicon, share image and notices to canonical asset paths and Docs.
The catalog build continues to copy its declared assets with its own synchronization
script. All English public share metadata points to `niu-social-en-dark.png`;
the bilingual social cards remain available for Chinese campaigns.

The legacy source mark is retained solely for provenance and silhouette checks.
It is not shipped in place of the new mark. Font colors in the live vector
wordmark inherit the current theme, so they update without swapping an image.
The public shell's language rules also apply outside Docs.

## Lockup alignment

The shared `sources/lettering.json` lockup placement uses y=27 at 0.8 scale. The visible Latin bounds (3.52–89.10) center at y=64.048 in the 128-unit symbol frame, correcting the former y=57.048 placement. Components and generated horizontal lockups use this shared placement. Standalone wordmarks and the stacked arrangement retain their own canvas positions.

# Brand assets

This directory contains approved Niu logos, favicon assets, and portable theme tokens. The English product name is **Niu**. Use `niu.io` only as the domain, not as the product name. The official Chinese name is **牛元** (combined form: **Niu 牛元**), replacing 牛刀. The character 元 connects the name to 词元, the Chinese term for token, and conveys the auspicious association intended for the brand.

Use `tokens.css` as the shared light and dark theme reference. Logos and favicons are copied to product packages at build time; application builds must not reach into this directory through a runtime filesystem path.

`manifest.json` records portable file checksums. `reference/SOURCE-LICENSE.txt` preserves attribution for the original brand artwork.

## Rounded brand kit

The [rounded kit](rounded/README.md) contains the approved brighter warm mark,
Maple Mono SemiBold (600) Latin and Open Huninn rounded Chinese lettering, scalable
SVGs, transparent PNGs, monochrome variants, app icons, favicons and social cards.
See its [dark](rounded/preview/niu-brand-sheet-dark.png) and
[light](rounded/preview/niu-brand-sheet-light.png) preview sheets. The public apps consume its language-aware vector wordmark and refreshed compact
mark. English surfaces use Niu; Chinese surfaces use Niu 牛元. Canonical assets
and packaged copies are synchronized with `node scripts/branding/sync.mjs`.

A ready-to-share archive is available at [niu-rounded-brand-kit.zip](niu-rounded-brand-kit.zip).

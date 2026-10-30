# Brand identity integration verification — 2026-10-30

Tracking: **niu-62w**. Scope: the approved bright warm mark and real-font lettering
in the dashboard, documentation, public catalog and independently built website.
Evidence describes local builds of the current working tree, with unrelated
pre-existing edits retained. No source commit or remote publication is implied.

## Decisions and criteria

English uses **Niu** with Maple Mono Bold lettering. Chinese uses **Niu 牛元** with
Open Huninn Chinese outlines. Compact navigation, loading and favicon locations
use the standalone seven-blade mark. The shared SVG renderer inherits foreground
color from the active theme; mark colors and shape match the approved asset kit.
Uploaded deployment logos, names and favicons keep their existing overrides.

The `ux-review` local-correction criteria applied here are stable layout,
responsive access to controls, recognizable branding and reuse of the existing
navigation shell. These are supported by
[WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and
[Consistent Navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html).
The checks below are scoped evidence, not a claim of complete WCAG conformance.
Niu-specific constraints preserve the existing brand palette, shared primitives,
English product name and Chinese brand name. OpenRouter's actual Models page was
inspected as the mature-product reference for a compact mark in navigation.

## Rendered checks

| Surface | Observed states | Evidence |
| --- | --- | --- |
| Login | English and Chinese, dark theme, 1280 px; Chinese at 375 px | Correct locale-specific lettering. The initial 375 px composition overflowed to 400 px. After hiding secondary header links at phone width, document width equals 375 px and the language control remains reachable. |
| Public catalog | English/Chinese; light/dark; 1280 px and 375 px; navigation menu open | Header and footer use the same artwork. Language and color menus retain native shadcn gutters. English hides Chinese labels. Both locale variants fit a single phone header row. |
| Documentation | English/Chinese; light/dark; 900 px, 800 px, 375 px; navigation open/closed; language/theme menus | Chinese labels initially wrapped at intermediate width. Shared no-wrap and compact spacing rules restore a single header row. At 800 px, client/scroll width is 785 px including the scrollbar allowance; the 142.31 × 36 px wordmark, navigation, dashboard action and tools occupy distinct, non-overlapping intervals. |
| Signed-in dashboard | Product rail at desktop; About in English/dark and Chinese/light at 375 px; Generations at 1280 px with history open/closed and at 375 px | Rail mark loads at 32 × 32 px; Generations mobile entry loads at 26 × 26 px. About uses the localized wordmark, 142.31 × 36 px in Chinese, with document width equal to the 375 px viewport. Account screenshots were kept out of public evidence. |
| Website | English desktop; Chinese 375 px; Chinese footer at desktop; standalone mark in product preview | Header and footer use the snapshotted shared renderer. Compact preview mark loads at 26 × 26 px. Default share metadata uses the English 1200 × 630 card. Existing page content and interactions remain outside this branding review. |

At 800 px, the documentation brand occupies x=24–166.31, navigation
x=194.30–481, dashboard action x=493–585, and tools x=597–761. Navigation links
are 43 px high with `white-space: nowrap`. At 375 px, the English wordmark is
87.75 × 36 px and the bilingual version is 142.31 × 36 px. The documentation
client and scroll widths are both 360 px, accounting for the vertical scrollbar.
The English mobile brand exposes only the English SVG. Escape dismisses the
mobile documentation navigation; footer keyboard focus retains a visible ring.

Screenshots:

- [English website, desktop](evidence/branding-identity-2026-10-30/website-en-1280-dark.png)
- [Chinese website footer](evidence/branding-identity-2026-10-30/website-zh-footer-dark.png)
- [Chinese documentation, 800 px](evidence/branding-identity-2026-10-30/docs-zh-800-light.png)
- [Chinese documentation, 900 px](evidence/branding-identity-2026-10-30/docs-zh-900-dark.png)
- [English documentation, 375 px](evidence/branding-identity-2026-10-30/docs-en-375-light.png)

## Build and asset evidence

- Dashboard TypeScript check and production build passed. Five relevant
  test files passed: **37 tests**, covering locale switching, branding settings,
  login handling and account settings.
- Documentation, catalog and website Astro checks returned zero errors or
  warnings. Their production builds passed. The documentation build emitted
  its existing MDX bundler advisory messages; the dashboard build retained its
  existing chunk-size advisories.
- Website's existing tests passed (**2**); brand snapshot verification passed
  without requiring the public source checkout during normal builds.
- Qualification snapshot tests passed (**7**). The capture includes the new
  renderer's shared CSS, vector sources and palette manifest.
- Asset verification passed for **79 deliverables**, five source files, all PNG
  sizes/transparency, portable SVGs and six ICO entries. Original mark silhouette
  overlap remains **99.46%**. Canonical brand checksums were refreshed and verified,
  including the existing theme-token checksum; theme-token content was unchanged.
- `sync.mjs` updates canonical assets, Docs copies and notices; the catalog's own
  build-copy script includes the English share image and standalone SVG. The
  ready-to-share ZIP contains **87 files** including sources and notices.

## Evidence limits and local runtime

Initial isolated frontend previews showed unavailable-service states because the
Gateway was stopped. The managed local stack was subsequently started using the
unchanged, supply-chain-validated lockfile and non-interactive `CI=true` mode.
A normal member session was used to inspect the actual product rail, About and
Generations surfaces. Both 1280 px desktop and 375 px phone layouts were checked;
Generations history was expanded and collapsed. Theme and language preferences
were restored to their starting System/English values, and the temporary member
session was signed out afterward.

No inference, payment or saved customer-content writes were performed. Screenshots
of account data were not added to the public tree. Custom display-name and uploaded
logo preservation are covered by two additional sign-in-header regression cases,
plus the existing branding API/settings tests; no live deployment override was
changed. Embedded Help retains its existing textual title and avoids adding another
logo to the dashboard shell.

The website synchronization is restricted to branding files and preserves its
unrelated shell snapshots. All changes remain local until separately committed
and published.

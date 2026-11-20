# Docs left-right split layout — 2026-11-17

Bead: `niu-jg8v`. Base revision: `a803ba78` (`origin/release/0.3`). Surface mode: **Read** (documentation overview, conceptual/quickstart guides, agent contracts, API/SDK references) unified with Niu's Dashboard **Operate** left-right shell rhythm.

## Reference and criteria

- **Internal shell reference:** Dashboard `SidebarHeader` + right content header in `apps/dashboard/app/shell/ShellNavigation.tsx` and `apps/dashboard/app/styles/shell.css`, keeping `branding/public-header.css` and `branding/public-navigation.json` untouched so `niu-io/website`'s `public-shell-manifest.json` contract remains intact.
- **Criteria (`ux-review`):**
  - *Read mode & wayfinding* (`SKILL.md`, `visual-review.md`, [NN/g Consistency heuristic](https://www.nngroup.com/articles/ten-usability-heuristics/)): Separate persistent global brand + section tree (`var(--sidebar)`) cleanly from the top utility bar (`var(--background)`) so desktop documentation navigation shares the same spatial model as Niu's signed-in console.
  - *System coherence & responsive bounds* (`visual-review.md`, [WCAG 2.2](https://www.w3.org/TR/WCAG22/) SC 1.4.10 Reflow & 2.4.7 Focus Visible): Preserve full-width mobile topbar + single brand mark on `< 50rem` viewports and full-width header fallbacks on sidebar-less routes (`/docs/api/explorer/`, `/docs/404.html`), with `0px` horizontal overflow and clear focus outlines.

## Changes implemented

- `apps/docs/src/components/Sidebar.astro`: Rendered `<NiuBrand />` inside `.docs-sidebar-header` above the mobile-only nav block and Starlight `<SidebarPersister>` navigation tree.
- `apps/docs/src/components/PageFrame.astro`: Kept `.docs-brand` (`aria-label`) synchronized across `en` (`Niu home`) and `zh-CN` (`Niu 首页`) on initial render and `astro:after-swap` transitions while excluding `.docs-brand` spans from sidebar link translation.
- `apps/docs/src/styles.css`:
  - Excluded `.docs-brand` from `.sidebar-content a` padding/min-height/pill rules and shared `.niu-brand` (`1.75rem`) height across `.docs-header` and `.docs-sidebar-header`.
  - Under `@media (min-width: 50rem)` scoped to `:root[data-has-sidebar]:not(:has(.docs-api-explorer))`: expanded `.sidebar-pane` to `inset-block: 0` with sticky `.docs-sidebar-header` (`64px` height, `22px` horizontal inset aligned to sidebar links, plus `12px` bottom gradient feather to prevent clipped glyphs during scroll); shifted `.header` to `inset-inline-start: var(--sl-sidebar-width)` (`268px`); hid `.docs-header > .docs-brand`; left-aligned `Docs | API | SDK | Models` tabs with active underline flush at the header bottom border; right-aligned `Dashboard`, `Search`, `Language`, and `Theme` controls; and compacted `50rem–69.999rem` padding/gaps so all four links fit in one row alongside utilities.
- `scripts/check-docs-audiences.py`: Verified built entrypoints retain `docs-sidebar-header` and `docs-sidebar-brand`.

## Verification evidence (built `apps/docs/dist` via `astro preview`)

Inspected rendered HTML/CSS in `ego-browser` against `http://127.0.0.1:4322/docs/` across desktop, intermediate, and mobile viewports:

1. **Desktop `1440×900` (Dark EN `/docs/`, `/docs/getting-started/`, `/docs/api/rest/`; Light `zh-CN` `/docs/getting-started/`, `/docs/agents/install/`):**
   - *Viewport budget:* `1440×900` → `.sidebar-pane` (`0, 0, 268×900` on `var(--sidebar)`) + `.header` (`268, 0, 1172×64` on `var(--background)`) + `.main-pane` (`x: 268, y: 64`); `overflowX: false`.
   - *Brand & header alignment:* `.docs-sidebar-brand` at `x: 22` aligns with `sl-sidebar-state-persist` link text at `x: 22` (`10px + 12px`); `.docs-header > .docs-brand` `display: none`; `<nav>` sits at left of `.header` with `64px` tab height and active `2px` bottom indicator flush with `.header` border.
   - *Sticky scroll & overlays:* Short viewport `1440×440` with `#starlight__sidebar` scrolled to `scrollTop: 180` kept `.docs-sidebar-header` at `y: 0, h: 64` with `12px` `::after` feather masking scrolled links. Search modal (`⌘K` / trigger button) opened cleanly in front of the layout.
2. **Intermediate `1024×800`, `820×800`, and `800×800` (Light `zh-CN` with `Models` link revealed):**
   - At `800×800` (`50rem`), `.header` (`268..800`, `532×64`) held `文档 | API | SDK | 模型`, `控制台`, `Search`, `中文`, and `Theme` on one row (`navWrapped: false`, `toolsClipped: false`, `overflowX: false`), with `mobile-starlight-toc` bar flush at `x: 268, w: 532`.
3. **Fallback & mobile views:**
   - `/docs/api/explorer/` (`1440×900` Dark): `.sidebar-pane` hidden (`0×0`), `.docs-sidebar-header` hidden, full-width `.header` (`0..1440`) displays `.docs-header > .docs-brand` cleanly alongside Scalar's internal API sidebar.
   - `/docs/404.html` (`1440×900` Dark, `!data-has-sidebar`): full-width `.header` displays `.docs-header > .docs-brand` normally.
   - Mobile `390×844` (`/docs/getting-started/`, Dark EN closed/open drawer & Light `zh-CN` closed): `scrollWidth: 390` (`overflowX: false`), `.docs-sidebar-header` `display: none` (no duplicate logo in open `#starlight__sidebar` popover), `.docs-header > .docs-brand` visible (`Niu home` / `Niu 首页`).

## Verification checks run

- `python3 scripts/render-project-status.py --check`: exit `0`.
- `node --test apps/docs/scripts/test-navigation.mjs`: `4/4` passed.
- `pnpm --dir apps/docs test:api`: `8/8` passed.
- `pnpm --dir apps/docs check`: `36 files`, `0 errors, 0 warnings, 0 hints`.
- `pnpm --dir apps/docs build`: `1059` pages built + Pagefind search index; `scripts/check-docs-audiences.py` & `scripts/check-public-boundary.py` (`3462` files) passed.
- *Limit:* Local `ego-browser` inspection ran against standalone `astro preview` (without a backing Gateway session for live `[data-public-models-link]` fetch or Scalar API key execution, so 4-item nav visibility was verified by un-hiding `[data-public-models-link]` in the DOM); live hosted Gateway `/docs/` parity requires staging verification after deployment.

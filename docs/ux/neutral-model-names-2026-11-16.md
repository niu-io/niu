# Neutral foreground color for model names and list row titles — 2026-11-16

Bead: `niu-oi4u`. Base revision: `215057e8` (`origin/release/0.3`). Surface mode: **Operate** (catalog discovery, request logs, usage tables, key capacity diagnostics).

## Reference and criteria

- **Mature-product reference:** Inspected live `https://openrouter.ai/models` on 2026-11-16 at `1440×900` (`body` foreground `rgb(252, 252, 254)` on `rgb(3, 8, 10)`). Model row/card links (`Hy4 flash`, `Qwen4 Max`, `Recraft V4.1 Flash V2`, `12.1B tokens`, `65.3B tokens`) render in default foreground `rgb(252, 252, 254)` rather than the brand accent color, keeping brand color for primary conversion actions.
- **Criteria (`ux-review`):**
  - *Operate mode — restrained semantic color & hierarchy* (`visual-review.md` / [NN/g Visual Design Principles](https://www.nngroup.com/articles/principles-visual-design/)): Reserve Niu primary orange (`#FF914D`) for filled primary actions and active navigation/focus affordances so dense lists and tables do not dilute focal emphasis.
  - *Color, state & non-color affordance* ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) SC 1.4.1 Use of Color, 1.4.3 Contrast, 2.4.7 Focus Visible) and [NN/g Consistency heuristic](https://www.nngroup.com/articles/ten-usability-heuristics/): Keep interactive row/card model links distinguishable via weight (`500`/`600`), `:hover` underline (`text-underline-offset: 3px`), and visible `:focus-visible` outlines while preserving `--foreground` contrast in both themes.

## Changes verified

- `Button` `link` variant (`apps/dashboard/app/components/ui/button.tsx`): changed default text color from `text-primary` to `text-foreground`, keeping `underline-offset-4 hover:underline` and `disabled:text-foreground/80`.
- Model catalog cards (`ModelTable.tsx`, `models.css`): added `text-foreground hover:underline` on model title `<Link>`s and `.models-card-meta` action links (`Open Generations`, `Try in Chat`, `Try in Video`) plus `:visited` selector coverage with `color: var(--foreground)`.
- Detail, overview, usage, executions, and library styles (`catalog.css`, `overview.css`, `shell.css`, `GatewayActivity.tsx`, `library/page.tsx`): changed `.model-activity-link`, activity/charge breakdown and overview links, `.gateway-feed-actions > a`, `.gateway-task-empty > a`, and `.playground-attempt-link` to `color: var(--foreground)` with `:hover` underlines; upgraded row model button weight in `GatewayActivity.tsx` (`font-normal` -> `font-medium`); changed compact deliverable card icon in `library/page.tsx` from `text-primary` to `text-muted-foreground`.

## Local verification (fixture-backed dev runtime)

Inspected in `ego-browser` against local Vite dev server + fixture gateway (`5b2e2e81.../neutral-models-gateway.mjs`; fixture responses demonstrate rendered styles and bounds only and do not constitute hosted staging acceptance). Zero console or failed-request errors observed during desktop inspection.

### 1. Theme and color checks (`1440×900`, `overflowX: false` on all routes)

| Surface | Dark (`html.dark`, `--foreground`: `#EFE2DA`) | Light (`--foreground`: `#45352F`) | Interaction / CTA check |
| --- | --- | --- | --- |
| Public `/models` (unauthenticated) | `rgb(239, 226, 218)` on model titles (`Claude Sonnet 4`, `GPT-4o`, `Seedance 2.0 Mini`) & `Open Generations` / `Try in Video` | `rgb(69, 53, 47)` on model titles & card meta actions | `Sign in` CTA retained `rgb(255, 145, 77)` bg; `:hover` underline verified |
| Workspace `/workspaces/default/models` | `rgb(239, 226, 218)` (`fontWeight: 600`) on titles & meta links | `rgb(69, 53, 47)` on titles & meta links | Hover `textDecorationLine: underline`; `Tab` focus outline `rgb(255, 145, 77) solid 2px` |
| Model detail `/workspaces/default/models/openai/gpt-4o` | `.model-activity-link` (`View requests for this model`): `rgb(239, 226, 218)` | `.model-activity-link`: `rgb(69, 53, 47)` | `Open Generations` filled CTA kept `rgb(255, 145, 77)` bg (`#45352F` text) |
| Overview `/workspaces/default` | Row buttons (`GPT 4o`, `Claude Sonnet 4`): `rgb(239, 226, 218)` (`500`); feed links `rgb(239, 226, 218)` | Row buttons: `rgb(69, 53, 47)` (`500`); feed links `rgb(69, 53, 47)` | `Open Generations` header CTA kept `rgb(255, 145, 77)` bg |
| Usage `/workspaces/default/usage` | Charge breakdown model links (`Claude Sonnet 4`, `GPT 4o`) & panel links: `rgb(239, 226, 218)` | Charge breakdown model links: `rgb(69, 53, 47)` | Hover underline (`3px` offset) added without descending specificity warnings |
| Request Logs `/workspaces/default/executions` | Row model buttons: `rgb(239, 226, 218)` (`fontWeight: 500`) | Row model buttons: `rgb(69, 53, 47)` (`fontWeight: 500`) | Hover underline verified |
| API key detail & `KeyCapacity` modal `/workspaces/default/keys/review-key` | Trigger buttons & modal row `openai/gpt-4o` link button: `rgb(239, 226, 218)` | Trigger & button variant `link` inherit `--foreground` (unit + component check; modal not separately reopened in light mode) | Real capacity row schema verified; zero orange leakage inside dialog |

### 2. Responsive layout bounds (dark mode)

- **Intermediate `1024×800` (`/workspaces/default/models`):**
  - Sidebar open (`240px`): content container `784px`, `scrollWidth: 1024` (`overflowX: false`), `sampleLinkClipped: false`.
  - Sidebar closed (`64px` after `.sidebar-header-toggle`): content container `960px`, `scrollWidth: 1024` (`overflowX: false`), `sampleLinkClipped: false`.
- **Mobile `390×844` (`/workspaces/default/models` and `/workspaces/default/executions`):**
  - Content width `390px`, `scrollWidth: 390` (`overflowX: false`), `sampleLinkClipped: false`; full-frame screenshots confirmed mobile table card stacking and readable model labels in `#EFE2DA`.

## Evidence limits & next step

- Local verification used mock gateway fixtures; live Workspace Library (`compact` deliverable card icon in `library/page.tsx`) and `KeyCapacity` dialog light-mode open state were verified via unit tests and token inheritance rather than separate light-mode screenshots.
- Hosted staging acceptance remains required after deployment to confirm visual parity against production/staging data.

# Online Production UX Review — 2026-10-27

## Scope & Methodology

- **Target**: Live hosted deployment at `https://niu.io` (release `v0.2.26` / `594e6568`, composed with `niu-io/website`).
- **Mode**: Review-only audit per `AGENTS.md` and the `ux-review` skill (`tiwater/skills`). No product source files or live production settings/financial records were mutated.
- **Session & Role Context**:
  - Live gateway health: `GET /healthz` → `200 OK` (`{"status":"ok","service":"niu"}`).
  - Platform currency & billing mode: `GET /v1/currency` → `200 OK` (`{"currency":"CNY","billing_mode":"currency","unit":null}`).
  - Payment readiness: `GET /api/v1/payments/readiness` → `200 OK` (`{"ready":true,"reason":null}`).
  - Authenticated browser session: `GET /api/v1/session` → `kind: "operator"`, `role: "owner"` (`demo@niu.io`, organization `Personal workspace`, workspaces `Default workspace`, `Video input Guardrails acceptance`, `发布验收 20261024`), `provider_memberships: ["fastrouter", "openrouter"]`, `permissions.platform_admin: false`.
- **Viewports & Themes Evaluated**:
  - Desktop (`1440×900` and host `1353×794`), Intermediate split-screen (`900×800`, with contextual navigation both collapsed and expanded), and Mobile narrow (`390×844`).
  - Light and Dark themes (`niu-dashboard-theme`), and both English (`en`) and Simplified Chinese (`zh-CN`) locales.

---

## 1. Revalidation of Prior Findings (`UX-01` – `UX-27` & Oct 24 Production Audit)

| Finding / Gate | Status on `https://niu.io` (`v0.2.26`) | Live Evidence |
| --- | --- | --- |
| **UX-01 / UX-02 / UX-24** (Customer pricing & workspace rate visibility) | **Verified Resolved** (Customer side) / **Blocked by Role** (Admin editor) | `/workspaces/release-qa-20261024/billing` → `Rates` tab displays workspace-authorized model rates (`qa/billing-free-20261024`, `qa/free-pool-20261024`) with context tier disclosure and zero exposure of Provider purchase prices or margins. Live `/admin/pricing` mutation UI is restricted to `platform_admin: true` (`Administrator access required` gate verified on `/admin/suppliers`). |
| **UX-04** (Service setup & payment readiness gate) | **Verified Resolved** | Full-page loads run `usePaymentReadiness` (`Checking service setup…`) and unlock workspace features once `/api/v1/payments/readiness` returns `ready: true`. |
| **UX-05** (BYOK vs Niu credits billing clarity) | **Verified Resolved** | Model cards, model detail pages (`/models/byok/openrouter/qwen3.8-flash`), Generations composer footer, and Logs/Activity explicitly distinguish `Own API key · billed by your Provider` from `Usage is charged to your Niu credits at the applicable model prices`. |
| **UX-06 / UX-14** (Video generation in Generations & Workspace Library) | **Verified Resolved** | Video generation lives under `/generations` (`Video` starter tab and saved video sessions), while `/workspaces/release-qa-20261024/library` provides durable workspace media retention (`1 files loaded`, `Generated video · 953 KB`) independent of temporary Provider download URLs. |
| **UX-09** (Provider logo contrast in dark theme) | **Verified Resolved** | Inspected `/models?workspace=release-qa-20261024` in dark mode: `.provider-logo` badges render with a distinct surface (`oklch(0.225 0.004 255)`) and high-contrast foreground (`oklch(0.94 0.004 255)`). |
| **UX-10** (Unresolved request capacity handoff) | **Verified Resolved** | Key detail page (`/workspaces/release-qa-20261024/keys/release-qa-free-model-20261024`) and `/docs/guides/request-capacity/` link unresolved concurrency and token reservations directly to request inspection. |
| **UX-15 / UX-18** (Rich-content rendering & terminal completion status in Chat) | **Verified Resolved** | Saved sessions (`session=chat-1025`, `session=chat-1003`, `session=chat-1000`) preserve ordered list numbering and explicitly surface `Output limit reached`, `Failed: The provider rate or spending limit was reached`, and `Response ended: The model’s completion reason is unavailable` instead of conflating transport completion with answer completeness. |
| **UX-19 / UX-21 / UX-26** (Guardrails section save scope, history preview & blocked-request handoff) | **Verified Resolved** | `/workspaces/release-qa-20261024/guardrails/denials` links `Workspace default · Version 1` to `/guardrails/history?revision=1&from=blocked`, which automatically opens the saved `Version 1` policy dialog (`Block: QA_BLOCK_20261024`) with a direct `Return to blocked requests` action. |
| **UX-22** (`niu-lxs.23`: Account funding task home) | **Implemented in UI; Human Validation Open** | Workspace Billing (`/workspaces/.../billing`) states `Spending and limits apply to this workspace. Funds are shared across the account.` with a direct `Manage credits` link that opens the shared `Settings → Credits` (`?settings=billing`) modal (`Available to spend ¥1.35`, `Add credits`, `Payment orders`, `Balance activity`). Bead `niu-lxs.23` remains `in_progress` pending the human participant protocol in `docs/ux/funding-task-validation.md`. |
| **UX-25** (Role separation in Quickstart & Admin docs) | **Verified Resolved** | `/docs/admin/customers/` immediately redirects customer developers to `/docs/getting-started/`, while `/docs/guides/api-quickstart/` and `/docs/guides/sdk-quickstart/` embed `<WorkspaceKeyConnection />` for browser-session testing without exposing raw key material. |
| **Oct 24 Audit Issues (`#111`–`#116`, `website#5`)** | **Verified Resolved** | Directional modality filters (`Input modalities` / `Output modalities`), `/help/` iframe embedding (`SAMEORIGIN`), and localized `<div data-lang="zh">` TOC filtering on `/docs/` all function as designed. |

---

## 2. Newly Discovered Findings on Live `https://niu.io` (`v0.2.26`)

### UX-28 (`niu-lxs.30`, P1 Bug) — Generations workspace collapses to a 364px left column when the history sidebar is closed

- **Trigger**: Open `https://niu.io/generations` on desktop (`1353×794` or `1440×900`) or intermediate (`900×800`) viewports when the `Generation history` sidebar is collapsed/closed (the default state when entering below `960px` or after clicking `Toggle generation history`).
- **Observed Behavior**:
  - `.page-content` measures `1285px` wide (at `1353px` viewport), but `.generations-layout`, `.generations-toolbar`, `.playground-chat-main`, and `.playground-composer` collapse horizontally to **`364.17px`** (`26.9%` of the viewport), leaving **`921px` of blank empty canvas** on the right.
  - Even when the `Generation history` sidebar is expanded (`256px` wide), `.generations-layout` only grows to `324px + 364px = 688px`, leaving the right `665px` of the `1353px` screen blank.
  - Inside the squeezed `364px` column, the 3-column starter prompt grid (`Car wash`, `Context budget`, `Snake game`) truncates descriptions after 1–2 words (`Shou yo...`, `How ma...`, `Build an...`), and the 5 category tabs (`All tasks`, `Reasoning`, `Build`, `Writing`, `Video`) wrap onto two rows.
- **Root Cause**:
  - In `apps/dashboard/src/styles.css:1772`, `.page-content:has(.playground-view)` sets `display: flex` (default `flex-direction: row`).
  - In `apps/dashboard/src/app/AppLayout.tsx:908,919`, `.gateway-route-content` uses `display: contents`, making the unclassed `<div hidden={setupBlocked}>` wrapper a direct flex item of `.page-content`.
  - Rule `styles.css:2104` (`.app-shell .main-panel > .page-content:not(.help-content):not(:has(.playground-view)) ... > .gateway-route-content > div:not([hidden]) { flex: 1; min-width: 0; }`) explicitly excludes `:has(.playground-view)`. As a result, `<div hidden={setupBlocked}>` has `flex: 0 1 auto` and shrinks to the min-content width of `.generations-layout` (`364px`).
- **Standards & Rule Citations**:
  - `AGENTS.md` (Surface styling): *"Dashboard management pages use the full available content width between navigation and canvas padding... Only the Generations chat reading column may retain a readable maximum width."*
  - `ux-review` `visual-review.md` (`C1 — One Sightline`, `C2 — Proportions Match the Job`): Primary workspace canvas must occupy its intended viewport allocation without unintended horizontal collapse or multi-line truncation of primary starter controls.

### UX-29 (`niu-lxs.31`, P1 Bug) — Simplified Chinese (`zh-CN`) mode translates the navigation shell while leaving primary dashboard, Generations, Models, and Provider surfaces in English

- **Trigger**: Switch interface language to `简体中文` via the product rail language button (`button[aria-label="切换界面语言"]`) or `Settings → Appearance → 界面语言`.
- **Observed Behavior**:
  - **Mixed-language dashboard screens**: The product rail, contextual sidebar (`概览`, `API 密钥`, `请求日志`, `素材库`, `安全护栏`, `活动`, `计费`, `成员`, `设置`), top Mock Payments banner, breadcrumb title, `Settings` modal shell (`账户`, `外观`, `额度与充值`, `关于`), and Workspace Settings (`/workspaces/.../settings`) render in Simplified Chinese. However, the primary body of almost every workspace and global route remains in English:
    - **Overview** (`/workspaces/...`): `Requests`, `All time · 10 recent shown`, `Token usage`, `Average latency`, `Customer charges`, `Own API key`, `Requests over time`, `Recent requests`, `View all requests`, table headers (`Time`, `Model`, `Status`, `Duration`).
    - **API Keys** (`/workspaces/.../keys`): `New API key`, `15 keys`, `Key / Model access / Limits / Expires / Last used / Status`, `Unlimited`, `Revoked`, `Create an API key` modal, and the entire Key Detail page (`Allowed models`, `Guardrails`, `Limits`, `Recent token usage`, `Source IP access`, `Spending limits`).
    - **Logs & Activity** (`/workspaces/.../executions`, `/workspaces/.../usage`, `/activity`): `Blocked requests`, `All time`, `Request volume`, `Time / Model / Status / Duration / Input tokens / Output tokens / Customer charge / API key`, `Request details` drawer, `Usage by workspace`.
    - **Library** (`/workspaces/.../library`): `Media saved in this workspace...`, `All media`, `Refresh`, `File / Saved / Actions`, `1 files loaded`.
    - **Guardrails** (`/workspaces/.../guardrails`, `/policy`, `/denials`, `/history`): `Blocked requests`, `History`, `Configure`, `Model & Provider Access`, `Input rules`, `External input checks`, `Output rules`, `Open Logs`.
    - **Billing & Credits** (`/workspaces/.../billing` and `?settings=billing`): `Spending and limits apply to this workspace. Funds are shared across the account.`, `Manage credits`, `Spending / Statements / Rates`, `Available credits`, `Available to spend`, `Low balance warning`, `Add credits`, `Payment orders`, `Balance activity`.
    - **Users & Organization Settings** (`/workspaces/.../users`, `/workspaces/.../organization`): `Refresh`, `Add user`, `User / Role / Status / Actions`, `General`, `Organization name`, `Workspaces`, `Create workspace`.
    - **Generations** (`/generations`): `Generations`, `New generation`, `Archived sessions`, `Choose API key`, `What would you like to create?`, `All tasks / Reasoning / Build / Writing / Video`, all 7 starter cards, `Prompt for all selected models`.
    - **SPA Models Catalog** (`/models?workspace=...`): `Filters`, `Input modalities`, `Output modalities`, `Model developer`, `Default order`, `32 models`, `Try in Chat`, `Try in Video`, `Make your first request`.
    - **Provider Portal** (`/providers/fastrouter/...`): `Last 30 days`, `Earnings at a glance`, `Period earnings`, `Unpaid earnings`, `Payments recorded`, `Your model offers`, `Payment history`.
  - **Residual English strings on `/docs/` and `/models/` in `zh-CN` mode**:
    - On `/models/` (public catalog) and `/docs/`, `<title>` remains English (`Public model catalog — Niu`, `Niu Documentation | Niu`, `Make your first API request | Niu`), header `aria-label` attributes remain English (`Search documentation`, `Language`, `Color mode`, `Refresh`, `Copy model ID ...`), the top sidebar link on `/docs/` reads `Why Niu?`, and heading anchor sr-only labels read `Section titled “...”`.
    - On `/docs/api/rest/` and `/docs/api/sdk/`, OpenAPI operation summaries (`Create an OpenAI-compatible chat completion`) and TypeDoc descriptions remain English while surrounding headings are Chinese.
  - **Split `localStorage` locale keys across surfaces**:
    - Marketing (`niu.locale`), Docs (`niu-docs-locale`), and Dashboard (`niu-dashboard-locale`) use three separate `localStorage` keys. Switching language in the Dashboard updates `niu-dashboard-locale` (and sends `postMessage` only if `/help/` iframe is currently mounted), leaving `niu.locale` and standalone `/docs/` or `/models/` out of sync when the user navigates across top-level routes.
- **Standards & Rule Citations**:
  - `ux-review` `structure-and-language.md` (`Language Consistency`): *"Every user-facing surface in a flow uses one language consistently unless the user is explicitly editing multilingual content. Mixed-language headings, labels, status messages, and empty states within the same screen are a defect."*

### UX-30 (`niu-lxs.32`, P2 Bug) — Contextual sidebar expansion at intermediate widths (`641px–959px`) overlays and clips primary workspace content

- **Trigger**: Resize viewport to an intermediate tablet/split-screen width (`900×800`) on `/workspaces/release-qa-20261024/keys` (or any workspace route) and click `Expand workspace navigation`.
- **Observed Behavior**:
  - Because `MOBILE_BREAKPOINT = 960` in `apps/dashboard/src/hooks/use-mobile.ts`, `Sidebar` switches to `<Sheet modal={false}>` (`position: fixed; left: var(--rail); width: 256px`) below `960px` with no layout gap (`sidebar-gap` is omitted) and no modal backdrop scrim (`modal={false}`).
  - Expanding the sidebar at `900×800` covers the left `256px` of the live page: the Mock Payments warning banner text is cut in half (`...odel costs / ...M requests still`), the breadcrumb `发布验收 20261024 / API keys` is clipped to `PI keys`, and the entire first column (`Key` name and link) of the API Keys table is hidden underneath the drawer while `Model access`, `Limits`, and `Status` remain visible and interactive on the right.
- **Standards & Rule Citations**:
  - `AGENTS.md` (UX review delivery gate): *"Check intermediate desktop and split-pane widths with navigation both open and closed; measure actual content width and accumulated wrapper gutters rather than only checking phone overflow."*
  - `ux-review` `visual-review.md` (`C1 — One Sightline`, `C4 — Controls Keep Breathing Room`): Navigation drawers must either dock in-flow (reflowing the content lane) or act as a true modal overlay with a scrim that dismisses on outside interaction, never leaving live data tables half-covered.

### UX-31 (`niu-lxs.33`, P2 Task) — Embedded `/help/` documentation renders a duplicate inner Starlight top bar inside the dashboard shell

- **Trigger**: Click `Documentation` (`/help/`) in the product rail or workspace sidebar.
- **Observed Behavior**:
  - `/help/` embeds `/docs/?embed=help` inside an `<iframe>` (`1285×726` at `1353×794` viewport).
  - Inside the iframe, Starlight still renders its 64px top `<header class="header">` containing `Niu 牛元文档` and a standalone `中文` language toggle button.
  - Users see two brand headers and two independent language switchers simultaneously (one in the dashboard rail, one inside the `/help/` header), and lose 64px of vertical reading space on top of the 68px Mock Payments banner.
- **Standards & Rule Citations**:
  - `ux-review` `visual-review.md` (`C1 — One Sightline`, `C5 — Repeated Chrome Earns Its Space`) & `structure-and-language.md` (`One Owner Per Responsibility`): Embedded documentation inside the product shell should rely on the parent shell's navigation and locale controls rather than duplicating top-level chrome.

### UX-32 (`niu-lxs.34`, P2 Task) — Generations video deep-links expose internal `intent`/`job`/`key` identifiers and require a two-step hop

- **Trigger**: Open `/generations`, select a saved video session (`Golden Sunset Ocean Waves` or `Live QA Oct19 — red ball video`), and click `Open saved request`.
- **Observed Behavior**:
  - Selecting a video session in the sidebar navigates to `/generations?workspace=default-workspace&video-session=video-1000`, which renders only a minimal card (`Calm ocean waves... / succeeded / Open saved request`) instead of showing the video result or expiration recovery view directly.
  - Clicking `Open saved request` navigates to `/generations?workspace=default-workspace&intent=input-1000&job=run-1019&key=5de8625a-63b8-4bf4-b990-ed656180e1ef`, exposing internal `intent`, `job`, and raw UUID `key` parameters in the URL bar, and on `video-1000` leaves the view stuck on `Loading keys… / Loading saved video… / Loading video models…` when the referenced UUID key is no longer active in the current workspace list.
- **Standards & Rule Citations**:
  - `AGENTS.md` (Internal identifiers & Readable product URLs): *"Never display internal GUIDs/UUIDs in product UI... Use durable, human-readable slugs for named product resources in browser paths and query scopes."*
  - `ux-review` `structure-and-language.md` (`Task Continuity`): Selecting a saved generation from history should open the complete saved artifact and its recovery controls in one step.

### UX-33 (`niu-lxs.35`, P3 Task) — Mobile (`390×844`) persistent warning banner and navigation headers consume 22%–33% of viewport height and leave drawer controls partially unlabeled/untranslated

- **Trigger**: Open `/workspaces/release-qa-20261024`, `/models?workspace=release-qa-20261024`, or `/generations` at `390×844` mobile viewport width.
- **Observed Behavior**:
  - At `390×844`, the persistent Mock Payments warning banner wraps to 4 lines (`128px` tall). Combined with the mobile page header (`56px` on `/workspaces/...`, `98px` on `/models`), persistent top chrome consumes **`184px` to `278px` (`21.8%` to `32.9%` of the `844px` viewport height)** before any page content appears.
  - When the mobile navigation drawer is opened in `zh-CN` mode, its bottom section switcher displays English `Navigation` (`overview_390.png`), and the top-right `×` close button (`[data-slot="sidebar"][data-mobile="true"] > button`) has no visible label or localized `aria-label`.
- **Standards & Rule Citations**:
  - `ux-review` `visual-review.md` (`C2 — Proportions Match the Job`, `C5 — Repeated Chrome Earns Its Space`) and WCAG 2.2 `4.1.2 Name, Role, Value`.

---

## 3. Quantitative Visual & Responsive Measurements

| Viewport & Route | Viewport (`vw×vh`) | Content Container Width | Horizontal Overflow (`scrollWidth > vw`) | Persistent Top Chrome Height | Visual Verdict |
| --- | --- | --- | --- | --- | --- |
| `1440×900` `/workspaces/release-qa-20261024` | `1440×900` | `1116px` (`1052px` inner table) | `false` (`1440px`) | `132px` (`68px` alert + `64px` header) | **Pass** — Full-width canvas between `324px` nav (`68px` rail + `255px` sidebar) and right edge; `32px` balanced outer gutters. |
| `1440×900` `/workspaces/release-qa-20261024/keys` | `1440×900` | `1116px` (`1052px` inner table) | `false` (`1440px`) | `132px` | **Pass** — Container query (`@container (max-width: 1250px)`) hides secondary `Expires`/`Last used` columns cleanly so the table fits without horizontal scroll. |
| `1440×900` `/generations` (sidebar collapsed) | `1440×900` (`1353×794` host) | **`364px`** inside `1285px` `.page-content` | `false` | `132px` | **Fail (`UX-28`)** — Unclassed wrapper `<div hidden={setupBlocked}>` shrinks to `364px`, leaving `921px` empty canvas on the right. |
| `1440×900` `/help/` | `1440×900` (`1353×794` host) | `1285px` iframe (`1029px` article) | `false` | `132px` (`68px` alert + `64px` inner Starlight header) | **Warn (`UX-31`)** — Full width is used (`fillRatio: 1.0`), but inner Starlight header duplicates brand and language chrome. |
| `900×800` `/workspaces/release-qa-20261024/keys` (sidebar closed) | `900×800` | `840px` (`790px` inner table) | `false` (`900px`) | `152px` (`88px` alert + `64px` header) | **Pass** — 4 core columns (`Key`, `Model access`, `Limits`, `Status`) fit cleanly within `790px`. |
| `900×800` `/workspaces/release-qa-20261024/keys` (sidebar open) | `900×800` | `840px` (left `256px` covered by non-modal drawer) | `false` (`900px`) | `152px` | **Fail (`UX-30`)** — Non-modal drawer covers the left `256px` of the banner, breadcrumb, and `Key` column. |
| `390×844` `/workspaces/release-qa-20261024` (drawer closed) | `390×844` | `390px` (`358px` inner table) | `false` (`390px`) | `184px` (`128px` alert + `56px` header) | **Warn (`UX-33`)** — Zero horizontal overflow, but top banner + header consume `21.8%` of viewport height. |

---

## 4. Beads Tracking Summary

- **Existing Open / In-Progress Beads under `niu-lxs`**:
  - `niu-lxs.23` (`P1`, `in_progress`): *UX-22: Account funding has no coherent task home* — Product UI handoff (`Workspace Billing → Manage credits → Settings → Credits`) is live on `https://niu.io`; awaits human participant task validation (`docs/ux/funding-task-validation.md`).
- **New Beads Created in This Review (`BEADS_ACTOR=ux-review-20261027`)**:
  - `niu-lxs.30` (`P1`, `bug`): *UX-28: Generations workspace collapses to a 364px left column when history sidebar is closed*
  - `niu-lxs.31` (`P1`, `bug`): *UX-29: Simplified Chinese (zh-CN) dashboard translates navigation shell while leaving workspace, Generations, Models, and Provider page content in English*
  - `niu-lxs.32` (`P2`, `bug`): *UX-30: Contextual sidebar expansion at intermediate widths (641px-959px) overlays and clips primary workspace content*
  - `niu-lxs.33` (`P2`, `task`): *UX-31: Embedded /help/ documentation renders a duplicate inner Starlight top bar inside the dashboard shell*
  - `niu-lxs.34` (`P2`, `task`): *UX-32: Generations video deep-links expose internal job/intent/key identifiers and use a two-step 'Open saved request' hop*
  - `niu-lxs.35` (`P3`, `task`): *UX-33: Mobile (390px) persistent warning banner and dual navigation bars consume 28-33% of viewport height and leave drawer close button unlabeled*

# Workspace Information Architecture and Top-Down UX Review (2026-11-02)

This review evaluates the Niu web application (`http://127.0.0.1:2566/` running the `codex/release-0.3.0` working tree at `7354c070f`, alongside `https://staging.niu.io/` at `16b018e8`) across the six top-down review layers defined in the UX review workflow:

1. **Product Role and Capability Scope**
2. **Information Architecture, Workspace Redundancy, and Terminology**
3. **Workflow Completeness and Journey Recovery**
4. **Page State, Density, and Scannability**
5. **Component Discipline, Controls, and Visual Alignment**
6. **Responsive Viewports, Localization (`zh-CN`), and Public Boundary**

---

## Part 1: Workspace Functional Redundancy and Entry-Point Pruning

### Problem Statement

A single customer workspace (`apps/dashboard/app/shell/navigation.ts` and `apps/dashboard/app/shell/WorkspaceNav.tsx`) currently exposes **12 first-level sidebar items** (`Overview`, `API keys`, `Logs`, `Model pools`, `Evaluations`, `Event subscriptions`, `Library`, `Video setup`, `Guardrails`, `Activity`, `Billing`, `Users`, `Settings` — 11 static plus `Video setup` when video models exist), in addition to **3 external workspace/organization surfaces** (`/workspaces`, `/workspaces/:slug/organization`, and duplicate header breadcrumb switchers in `ShellHeader.tsx`) and the **6-item left Product Rail** (`Workspace`, `Generations`, `Activity`, `Models`, `Admin`, `Docs`).

Inspecting the underlying route components and live rendered pages reveals three structural problems:

1. **Duplicate views backed by the exact same component**: `Overview` (`/workspaces/:slug`), Workspace `Activity` (`/workspaces/:slug/usage`), Workspace `Logs` (`/workspaces/:slug/executions`), and Global `Activity` (`/activity`) all render `<GatewayActivity />` (`apps/dashboard/app/features/executions/GatewayActivity.tsx`) against `/requests`. Similarly, `Model pools` (`/pools`), `Evaluations` (`/evaluations`), and `Event subscriptions` (`/events`) all render the exact same read-only `<AgentReviewPage />` (`apps/dashboard/app/features/agent-review/page.tsx`).
2. **Features placed in the wrong product scope**: `Video setup` (`/workspaces/:slug/video/volcengine`) and `Library` (`/workspaces/:slug/library`) belong to `Generations`, not to per-workspace API and agent governance.
3. **Hollow or fragmented configuration pages**: `/workspaces/:slug/organization` is a read-only stub duplicating `/workspaces`; `Settings` (`/workspaces/:slug/settings`) contains only a single name input and a delete button while workspace members (`Users`), workspace spending limits (`Billing -> Spending`), and webhooks (`Event subscriptions`) are scattered across separate top-level sidebar entries.

### Entry-by-Entry Disposition Matrix (`retain` / `combine` / `move` / `retire`)

| Current Surface / Route | Underlying Implementation | Disposition | Rationale and Target Location |
| :--- | :--- | :--- | :--- |
| **`Video setup`** (`/workspaces/:slug/video` -> `video/volcengine`)<br>**`Library`** (`/workspaces/:slug/library`) | `features/provider-modules/volcengine/VolcengineView.tsx` (upstream material groups, two-phase idempotent asset operations, and real-person liveness/identity verification) + `features/library/page.tsx` (workspace-saved reference images and generated media copies) | **Combine into Unified `Assets` (`素材与主体`) & Connect to `Generations`** | Video generation depends on stateful, asynchronous upstream asset preparation — specifically **real-person identity/liveness verification (`Human verification`)**, **upstream material groups (`provider_asset`)**, and **reusable workspace reference images & saved outputs (`workspace_asset`)**. Splitting them into `Library` and a misnamed, vendor-hardcoded `Video setup` (`/video/volcengine`) fragments the asset lifecycle, while hiding `Provider tools` inside the resolution gear popover in `/generations` makes upstream materials undiscoverable during creation. Consolidate `Library` and `Video setup` into a single Workspace **`Assets` (`/workspaces/:slug/assets`)** section with second-level tabs (`Workspace files`, `Provider materials`, `Identity verification`), stop polling `/v1/video/models` on every workspace mount (`useWorkspaceVideo.ts`), and surface a first-class `Materials & Subjects` picker directly in the `/generations` video composer toolbar. |
| **`Organization settings`** (`/workspaces/:slug/organization`) | `features/organization/page.tsx` (read-only organization label + minimal workspace list; hides `WorkspaceNav` while keeping `/workspaces/:slug/` in the URL) | **Retire** | Completely redundant with `/workspaces` (`WorkspaceDirectory.tsx`), which already provides workspace search, 30-day request sparklines, active key counts, and workspace creation. Keep organization-level metadata in `/workspaces` or `SettingsDialog`. |
| **`Activity`** (`/workspaces/:slug/usage`) | `features/activity/page.tsx` -> `<GatewayActivity statisticsOnly />` | **Combine into `Overview`** | Renders the exact same 4 summary cards (`Requests`, `Token usage`, `Average latency`, `Customer charges`) and `Requests over time` area chart as `Overview` (`<GatewayActivity compact />`), adding only model/key breakdown tables below. Having `Overview`, `Logs`, Workspace `Activity`, and Global Rail `Activity` simultaneously confuses users. Fold the model/key breakdown into `Overview` and remove `Activity` (`/usage`) from the Workspace sidebar. |
| **`Overview`** (`/workspaces/:slug`) | `features/overview/page.tsx` -> `<GatewayActivity compact />` | **Retain (Expanded)** | Primary workspace landing surface. Combine with the model/key usage breakdowns from `/usage` and keep the `Recent requests` preview linking to `Logs`. |
| **`API keys`** (`/workspaces/:slug/keys`) | `features/keys/page.tsx` | **Retain** | Essential workspace capability for creating, scoping, and auditing API credentials and per-key budgets/rate limits. |
| **`Logs`** (`/workspaces/:slug/executions`) | `features/executions/page.tsx` -> `<GatewayActivity />` | **Retain** | Essential request-level inspection, latency breakdown, payload drawer, and CSV export surface. Connect `Guardrails` blocked-request counts directly to `Logs` filters. |
| **`Model pools`** (`/workspaces/:slug/pools`)<br>**`Evaluations`** (`/workspaces/:slug/evaluations`)<br>**`Event subscriptions`** (`/workspaces/:slug/events`) | `features/agent-review/page.tsx` (`<AgentReviewPage />` branching on pathname regex `/\/(pools\|evaluations\|events)/`) | **Combine into Tabs** | All three routes render the same read-only agent-artifact inspection component with identical empty states (`Ask your coding agent to...` + `Copy agent prompt`). Occupying three first-level sidebar slots bloats navigation and causes `Model pools` to collide in name with `/admin/pools`. Consolidate into a single sidebar section (`Routing & Evals` or `Agent Policies`) with second-level `Tabs` (`Model pools`, `Evaluations`, `Event subscriptions` — or move `Event subscriptions` into `Settings -> Webhooks`). |
| **`Guardrails`** (`/workspaces/:slug/guardrails`) | `features/guardrails/page.tsx` | **Retain or Combine under Policies** | Provides interactive policy creation, quick-attach templates (`Content moderation`, `PII protection`, `Prompt shield`), and dry-run testing (`Test content`). Either keep as a focused policy entry or pair with `Routing & Evals`. |
| **`Billing`** (`/workspaces/:slug/billing`) | `features/billing/page.tsx` (`Spending`, `Statements`, `Rates` tabs) | **Prune `Rates` tab & Merge `Spending limits` into Workspace `Settings`** | Per `docs/ux/blueprint.md`, model selling prices are platform-wide (`/models`) and company credits live in `SettingsDialog` (`?settings=billing`). The per-workspace `Rates` tab (`?tab=rates`) renders an empty table (`No rates published`) and duplicates `/models`. Move workspace `Spending limits` directly into Workspace `Settings` (or `Guardrails` budget policy, following OpenRouter) and fold monthly usage statements into `Overview`. |
| **`Users`** (`/workspaces/:slug/operators`) | `features/operators/page.tsx` (`OperatorsView` listing `organization_id` operators, where `project_id === null` members appear in every workspace and revoking them revokes organization-wide access) | **Move to Organization Level (`SettingsDialog -> Members`)** | Team membership is an **Organization-level** concept, whereas a **Workspace** is an isolated environment/workload container (for API keys, guardrails, routing pools, and logs). Keeping `Users` in each workspace sidebar forces teams to manage people per environment and creates a destructive trap where revoking an organization-wide user (`project_id === null`) inside one workspace removes their access across the entire organization. Move `Members` (and organization name settings from `/organization`) into the global `SettingsDialog` (`?settings=members`) alongside `Account` and `Credits`. |
| **`Settings`** (`/workspaces/:slug/settings`) | `features/workspace/page.tsx` (single name input + delete button) | **Retain (Enriched as Single Environment Settings Page)** | With `Members` moved to organization-level `SettingsDialog`, Workspace `Settings` becomes a clean, single-page environment configuration surface housing: (1) Workspace name & slug, (2) Workspace spending limits (`WorkspaceSpendingLimits` from `/billing`), (3) Webhook event subscriptions (or keep under Agent Review), and (4) Delete workspace. |
| **Desktop Header Breadcrumb Switchers** (`ShellHeader.tsx:180-316`) | Two `DropdownMenu` triggers (`Default workspace ▾ / Overview ▾`) directly adjacent to the expanded `WorkspaceNav` sidebar | **Simplify on Desktop** | When the desktop sidebar is expanded (`md:flex`), the top-left viewport shows two identical `Default workspace ▾` triggers and two page navigation menus within 280px. Keep dropdown switchers for mobile (`<768px`) or collapsed-sidebar states; render a clean heading/breadcrumb on desktop. |

### Recommended Consolidated Workspace Sidebar (12 Items -> 6 Items)

1. **`Overview` (`概览`)** — KPI summary cards, time-series charts, model/key usage & customer charge breakdowns (merged from `/usage` and monthly statements), and recent requests.
2. **`API keys` (`API 密钥`)** — Workspace credentials, per-key limits, and key-scoped activity.
3. **`Logs` (`请求日志`)** — Request-level filter bar, timeline, and diagnostic inspection drawer.
4. **`Assets` (`素材与主体`)** — Unified media and upstream video-subject management (merging `Library` and `Video setup`) with tabs for `Workspace files` (saved outputs & reusable reference images), `Provider materials` (upstream material groups & two-phase asset status), and `Identity verification` (real-person subject verification sessions).
5. **`Policies & Evals` (`策略与评估`)** *(or `Guardrails` + `Routing & Evals`)* — Workspace governance: `Guardrails` (content/PII/model rules), `Model pools`, and `Evaluations`.
6. **`Settings` (`工作空间设置`)** — Single-page environment configuration: workspace name & slug, workspace spending limits (`Spending limits`), event webhooks (`Event subscriptions`), and workspace deletion. *(Human team members move to global `SettingsDialog -> Members` alongside `Credits`.)*

---

## Part 2: Top-Down UX and Visual Design Findings (`http://127.0.0.1:2566/` and `https://staging.niu.io/`)

### Improvements Verified on Local `http://127.0.0.1:2566/` (`7354c070f` working tree) vs. `https://staging.niu.io/` (`16b018e8`)

- **Duplicate `PageHeader` H1s eliminated on standard routes**: `PageHeader` now portals page-level action buttons into `#dashboard-page-actions` inside `ShellHeader` (`docs/ux/header-spacing-2026-11-02.md`), removing the redundant second `<h1>` row on `Overview`, `API keys`, `Logs`, `Library`, `Guardrails`, `Billing`, `Users`, and `Admin` pages.
- **Mobile (`390×844`) top-right `Navigation ▾` restored on Workspace pages**: Workspace pages at `390×844` now keep the mobile `AccountMenu` (`Navigation ▾`) accessible in `ShellHeader`.
- **Desktop (`1440×900`) `Logs` table horizontal clipping resolved**: The rightmost `API Key` badge (`Demo API key`) fits within the `1440px` viewport without horizontal overflow.
- **`Niu` brand naming rule enforced in dashboard components**: `NiuBrand.tsx`, `branding/page.tsx`, and `retail-pricing/page.tsx` now render `Niu` instead of `Niu 牛元`.
- **Model catalog populated locally**: `/models?workspace=default-workspace` renders 27 models with active modality and developer facets.

---

### Remaining Priority Findings on Local `http://127.0.0.1:2566/`

#### Layer 1 & 3: Product Scope, Onboarding, and Journey Recovery

1. **`[P0]` Embedded `/help/` route renders a completely blank page (`apps/dashboard/app/routes.tsx`, `ShellHeader.tsx`)**
   - **Evidence**: Navigating to `http://127.0.0.1:2566/help/` (linked from `AccountMenu` and onboarding prompts) renders only the top `Mock payments enabled` warning bar and an empty canvas (`h1s: []`, `h2s: []`), with no `ShellHeader` title or mobile sidebar toggle.
   - **Remediation**: Either serve the documentation bundle at `/help/` or redirect `/help/*` to `/docs/` so documentation links never dead-end on a blank screen.

2. **`[P1]` `GET /v1/branding` returns `401 authentication_error` for unauthenticated callers (`apps/gateway/src/payments/readiness.rs:454`)**
   - **Evidence**: `customer_feature(path)` exempts `/v1/currency` from the `/v1/` authentication gate (`path != "/v1/currency"`) but omits `/v1/branding`. Unauthenticated requests on `/login`, `/installation`, and `/connect` receive `HTTP 401`, preventing custom installation branding from loading before sign-in.
   - **Remediation**: Exempt `GET /v1/branding` alongside `/v1/currency` in `customer_feature(path)` or mount public branding on a public read route.

3. **`[P1]` Unauthenticated `/connect?code=...` loses agent-authorization context and `/connect` has a no-op `Reload request` button (`apps/dashboard/app/features/connect/page.tsx:39-65, 200-209`)**
   - **Evidence**:
     - Opening `/connect?code=ABCD-1234` while signed out redirects silently to `/login` (`RequireAuth` sets `state.from`) without explaining on `/login` that a coding agent is waiting for authorization.
     - Visiting `/connect` without a valid code displays a `Reload request` button that re-calls `fetchConnectRequest(userCode)` with an empty `userCode`, which immediately sets the same error (`No connect code was provided`) and offers no manual verification-code input field.
   - **Remediation**: Render an agent-authorization banner on `/login` when redirected from `/connect`, and provide a manual verification-code `<Input>` on `/connect` when `code` is missing or expired.

4. **`[P1]` Hardcoded `https://niu.io` in agent setup prompts and `/docs/llms.txt` (`apps/docs/src/components/DocsHome.tsx:13-14`, `apps/docs/src/pages/llms.txt.ts:3`)**
   - **Evidence**: Clicking `Copy setup prompt` on `/docs/` or reading `/docs/llms.txt` on local or staging deployments instructs the coding agent to fetch `https://niu.io/docs/install.md` rather than the active deployment origin (`window.location.origin`).
   - **Remediation**: Derive the setup prompt URL from the current origin on the client and configured site origin at build/request time.

---

#### Layer 2 & 5: Visual Hierarchy, Duplicate Headers, and Component Discipline

5. **`[P1]` `AgentReviewPage` (`/pools`, `/evaluations`, `/events`) and `/activity` still render duplicate page titles (`apps/dashboard/app/features/agent-review/page.tsx:789-791`, `apps/dashboard/app/features/activity/GlobalActivityPage.tsx`)**
   - **Evidence**: While `PageHeader` was updated to avoid duplicating `ShellHeader`, `AgentReviewPage` manually renders a second `<h1 className="text-xl font-semibold">{title}</h1>` directly underneath `ShellHeader` (`h1s: ["Model pools", "Model pools"]`, `["Evaluations", "Evaluations"]`, `["Event subscriptions", "Event subscriptions"]`). Similarly, `/activity` renders `Activity` in the left header and `Overview` in the main header with repeated metric cards.
   - **Remediation**: Portal the `Copy agent prompt` / `Connect your agent` buttons into `#dashboard-page-actions` (via `PageHeader`) and remove the duplicate in-body `<h1>` in `AgentReviewPage`.

6. **`[P1]` `SettingsDialog` (`?settings=billing`) renders duplicate `Settings` headings and an orphan `Toggle Sidebar` button inside a modal (`apps/dashboard/app/features/account/settings-shell/SettingsDialog.tsx`)**
   - **Evidence**: Opening `?settings=billing` renders two `<h2>Settings</h2>` headings and a `Toggle Sidebar` button inside the fixed modal dialog.
   - **Remediation**: Suppress the `SidebarTrigger` (`Toggle Sidebar`) and duplicate header inside the desktop modal dialog.

7. **`[P2]` `Logs` (`Request volume`) histogram visual regression (`apps/dashboard/app/features/executions/components/ActivityCharts.tsx`)**
   - **Evidence**: On `/workspaces/default-workspace/executions`, the `Request volume` chart renders a single ultra-wide dark bar (`Oct 6`) alongside 1px baseline ticks with no Y-axis labels or gridlines, contrasting sharply with the clean Recharts area chart on `Overview`.
   - **Remediation**: Constrain `maxBarSize` (e.g. `24px–32px`), add subtle horizontal gridlines or Y-axis scale, and align empty-bucket rendering with the `Overview` time-series chart.

8. **`[P2]` Persistent `Mock payments enabled · Real model costs` banner does not persist dismissal across reloads (`apps/dashboard/app/shell/AppLayout.tsx:110`)**
   - **Evidence**: `const [paymentWarningDismissed, setPaymentWarningDismissed] = useState(false)` resets on every page refresh or new tab, consuming ~84px of vertical viewport height across every workspace, model, and admin screen.
   - **Remediation**: Persist dismissal keyed by installation/mode in `sessionStorage` or `localStorage`, or compact the indicator into a status pill after first acknowledgment.

9. **`[P2]` Internal database fixed-point `atoms` exposed in customer and admin billing surfaces (`apps/dashboard/app/features/billing/page.tsx:297`, `WorkspaceSpendingLimits.tsx:217`, `platform-units.tsx`)**
   - **Evidence**: Customer billing statements and spending-limit descriptions display raw internal storage units such as `(0 atoms)` and `1 unit = 1,000,000,000 exact atoms`.
   - **Remediation**: Format customer-facing monetary and credit amounts using standard currency/credit precision and keep fixed-point `atoms` in backend contracts and diagnostic tooltips only if needed by platform operators.

---

#### Layer 6: Responsive Viewports (`390×844` / `768×1024`) and Localization (`zh-CN`)

10. **`[P1]` Mobile (`390×844`) `/generations` lacks top-level navigation (`AccountMenu`) and overlaps starter cards with the floating composer (`apps/dashboard/app/features/generations/page.tsx`)**
    - **Evidence**: At `390×844`, `/generations` renders only `[Toggle generation history]` and `[API key: Demo API key]` in the top bar (no `Navigation ▾` or `AccountMenu` trigger), stranding mobile users on `/generations` unless they open the session drawer. In addition, the bottom floating composer (`top: 660px`) overlaps the third starter card (`Compare Models`, `bottom: 707px`), and the composer model chip displays `[paperclip] 1 +` instead of the selected model name.
    - **Remediation**: Keep the mobile `AccountMenu` trigger in the `/generations` header, add sufficient bottom padding (`pb-48`) to the empty-state scroll container, and display a readable model label on the composer chip.

11. **`[P1]` Systemic `useLocale()` initial-render English flash and remaining untranslated `zh-CN` strings (`apps/dashboard/app/shell/locale.ts:87`, `locale-messages.ts`)**
    - **Evidence**:
      - `useLocale()` initializes `useState<Locale>('en')` and only syncs `readLocale()` (`localStorage.getItem('niu-dashboard-locale')`) inside `useEffect`, causing lazy-loaded routes and dialogs to render one frame of English before switching to `zh-CN`.
      - `PublicHeader.tsx:12`, `Header.astro:10`, and `PageFrame.astro:13` map `'Docs': 'Docs'` in `zh-CN`, rendering mixed `博客 | 模型 | Docs | 对比` navigation.
      - `ActivityCharts.tsx` formats chart axis dates (`Oct 6, 9:52 PM`) in English regardless of active UI locale.
      - `operators/components/OperatorsView.tsx:20` returns English `Owner / Admin / Viewer` role labels without `translateUI()`.
      - `customer-accounts/page.tsx:118,120` and `retail-pricing/page.tsx:203,205` pass unlocalized English strings (`'Credits rate saved.'`, `'Noncash grant issuance confirmed...'`) to `setNotice()`.
      - `npm run build` in `apps/dashboard` currently reports 9 untranslated-template check findings (`docs/ux/header-spacing-2026-11-02.md`).
    - **Remediation**: Initialize `useLocale()` synchronously from `readLocale()` on the client, translate `'Docs'` to `'文档'`, pass the active locale to `Intl.DateTimeFormat` in chart axes, wrap operator role labels and admin notices in `t()`/`translateUI()`, and clear the 9 build-time localization check items.

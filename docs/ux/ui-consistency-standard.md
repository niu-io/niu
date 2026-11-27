# Niu UI & Interaction Consistency Standard

This document defines the mandatory, product-wide UI and interaction standards for the Niu dashboard. Every new or modified page, dialog, menu, composer, and status surface must conform to these rules so the product looks and behaves as one coherent system rather than a collection of ad-hoc overrides.

In narrow headers, truncate the parent breadcrumb before clipping a short current page title. Keep the workspace picker and page actions reachable.

## 1. Visual System & Semantic Tokens

- **Single token source**: Define brand, surface, text, border, and elevation tokens in [`branding/tokens.css`](../../branding/tokens.css) and map them in [`apps/dashboard/app/styles/theme.css`](../../apps/dashboard/app/styles/theme.css). Never hardcode one-off hex colors in feature stylesheets or JSX.
- **Brand primary & contrast**: Primary actions use burnt orange-brown (`#B3471A` light / `#B84B1C` dark) with warm near-white foreground (`#FFFBF7`) for crisp readability. On dark surfaces, text links and inline error copy use `--primary-ink` and `--destructive-ink` rather than low-contrast button fill tones.
- **Warm-stone surfaces & subtle separation**: Follow Manus-style surface restraint — separate navigation, canvas, and sections with subtle solid background tones and spacing (`#FAF9F7` / `#F3F1ED` light, `#191716` / `#221F1D` dark) rather than repeated bordered cards or decorative shadows. Reserve elevation (`--shadow-composer`, `--shadow-panel`) for floating composers, popovers, menus, and dialogs.
- **Sidebar hierarchy**: Active navigation items use a clear, unmistakable fill (`#E8E3DC` light / `#2F2A26` dark) with medium-semibold ink (`--sidebar-accent-foreground`).
- **Concise Chinese labels**: Use the shortest unambiguous Chinese noun or verb for navigation, buttons, field labels, statuses, and headings. Do not retain qualifier phrases already established by the section, icon, or entity name (`在对话中试用` → `试用`; `外观与语言` → `外观`; `成员管理` → `成员`; `额度与充值` → `额度`; `保存更改` → `保存`; `版本发布说明` → `发布说明`). Keep entity, authorization, scope, and financial terms intact, and keep the English label coherent with the Chinese action. Explanatory and metric labels stay complete when the short form would be ambiguous (`可用余额`, `账面余额`, `请求预留`, `已关闭`).

The shared header tab strip keeps its selected tab fully visible on direct entry, selection changes, and viewport resize. Scroll only the strip so page position and keyboard focus are preserved.

The API key directory shows one labeled creation action at every width, including when an active filter hides historical keys.

## 2. Stable Dialog Frames & In-Control Loading

- **Stable modal frame across sections**: A global Settings dialog must keep the same outer size across every section. Never measure the active section and resize the dialog (the frame will jump when users switch tabs); group sparse content with dividers and section headings inside the fixed frame, and scroll only the content region. Never render a visible global title bar or lead strip inside the modal; keep the dialog title screen-reader-only, reserve top space for the floating close control, and render section-specific actions only when present. About uses one centered identity/resource composition rather than stretching sparse content across the frame or pinning legal links to the bottom.
- **Never collapse a dialog while loading secondary data**: When a dialog opens and needs to fetch choice options, saved roles, or secondary metadata, keep `DialogHeader`, form/detail structure, helper slots, and `DialogFooter` stably mounted (`0px` frame jump).
- **Show loading in place**:
  - For dropdown/choice fields whose options are loading, keep the field and trigger mounted with `aria-busy="true"`, a spinner icon (`IconLoader2` with `animate-spin`), and a clear loading label inside the trigger and/or menu.
  - For detail dialogs whose primary record is already known (such as member details), render the record immediately and scope the loading/retry state strictly to the pending section (e.g., the Role selector), never replacing the entire dialog with a generic skeleton.
  - For data-table dialogs (such as capacity inspection or archived sessions), render `TableSkeleton` inside the table slot on initial open (`rows.length === 0`) and keep existing rows visible during refreshes while reflecting busy state on the refresh/pagination button.
- **Modal discipline & field rhythm**:
  - Every page-level create, edit, rename, limit-setting, and destructive confirmation action opens an installed shadcn `Dialog` with bounded scroll and restores focus via `onCloseAutoFocus`. The shared `DialogContent` supplies the default `max-h-[90dvh] overflow-y-auto` frame, `DialogHeader` reserves the close-control gutter, and `DialogTitle` uses CJK-safe `leading-snug`; call sites only override these defaults for a concrete tighter bound or an intentional flex/inner-scroll layout.
  - Never nest a `Dialog` inside an already-open modal; keep secondary confirmations inside modals inline.
  - Every labeled form field pairs `<Label>` (which uses `leading-snug` so CJK glyphs never clip or touch controls below) and its input/trigger inside an explicit `grid gap-2` (or `space-y-2`) container. A global zero-specificity CSS safeguard in `foundation.css` also enforces `display: grid; gap: 0.5rem;` on any unspaced block container holding a visible `<Label>` inside forms, dialogs, and popovers.

- **No trailing arrow icons in button labels**: Action buttons and button-styled links never append a diagonal arrow or external-link glyph after their label. Use a leading meaningful icon, no icon, or a trailing `ChevronRight` for directional navigation; external links keep the external affordance in the leading icon or accessible name.
- **Transparent top navigation bars at rest, frosted glass on scroll**: Sticky/fixed top navigation bars (`.public-header`, Starlight `header.header`, `.public-models-topbar`, and `.dashboard-page-header`) must render completely transparent when unscrolled (`background: transparent`, `backdrop-filter: none`, `box-shadow: none`, and transparent bottom border unless hosting active header section tabs) and switch to frosted glass only when scrolled (`scrollY > 8` / `scrollTop > 8`: `68%–72%` translucent `--background` + `saturate(180%) blur(20px)` + subtle bottom hairline).
## 3. Uniform Choice, Header & Toolbar Controls

Legacy platform settings URLs open the matching tab in the shared settings header. Keep unrelated query parameters and fragments when redirecting.

Search paginated audit history on the server before applying page limits. Match localized display labels, load further results only on request, and restore the first page when search is cleared.

- **DropdownMenu only**: Never use native `<select>` / `<option>`, shadcn `Select`, or custom dropdown abstractions. Compose shadcn `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, and `DropdownMenuRadioGroup` / `DropdownMenuRadioItem` (or `DropdownMenuCheckboxItem`) directly, keeping the selection check on the right aligned with standard items.
- **PageHeader vs. Toolbar division**:
  - Place page-level primary creation/publish actions and the page refresh button in `PageHeader`'s right action slot — never drop primary page actions into a disconnected mid-page row beneath an alert banner.
  - Standardize every page-level refresh control in `PageHeader` as an icon button: `variant="ghost" size="icon-sm"` with `aria-label`, `title`, and `animate-spin` while loading.
  - Never duplicate a sibling `Tabs` destination as a button in `PageHeader` (e.g., when `[Usage | Billing and rates]` tabs are present, do not repeat a `Billing and rates` button in the header).
  - Match the `PageHeader` route title to its active sidebar section name, and avoid repeating the active tab's label verbatim as the first inner card heading.
- **Spatial mapping for panel toggles**: Controls that open or close a **left** drawer/sidebar (such as Generations `Sessions` history) sit on the **left** side of the toolbar adjacent to the title; controls that open **right** panels (`Assets`, `Context`) sit on the **right**.
- **Single primary CTA per view or checklist**: Within a toolbar or setup checklist, at most ONE button carries primary (`variant="default"`) emphasis (the primary creation action or the next blocking step); all remaining steps use `variant="outline"`.
- **Identical toolbar actions share one component**: Sibling modes MUST use the exact same component and interaction pattern for equivalent toolbar controls.
  - Across Generations (`Chat`, `New Video`, and `Video Session`), the top-right API key selector MUST use [`GenerationKeyPicker`](../../apps/dashboard/app/features/generations/GenerationKeyPicker.tsx) (`DropdownMenu`-based, immediate single-click switching, in-place loading indicator, cross-workspace switching, and `Manage keys` / `Create API key` actions).
- **No premature primary CTA flashing**: Toolbar selectors and recovery buttons MUST stay neutral (`variant="outline"`) while initial data is loading. Only apply primary emphasis (`variant="default"`) after a missing or invalid state is confirmed (`!loading`).

- **List readability and action affordance**: Management lists must not hide a decision-critical field in a truncated fixed column. API key rows expose model access, limits, expiry, status, and last use in a responsive row/list with no horizontal scrolling; multi-model access may use a keyboard-accessible popover, and model trial actions must look like actions (button/link with affordance), not metadata text.

Registration review rows keep the applicant identity and available decision actions readable without horizontal scrolling across desktop, tablet and phone widths.

## 4. Unified Input & Composer Controls

- **Single shared composer across all Generations modes**: `Chat`, `New Video`, and `Video Session` MUST all render [`GenerationComposer`](../../apps/dashboard/app/features/generations/GenerationComposer.tsx) and [`GenerationComposerCover`](../../apps/dashboard/app/features/generations/GenerationComposer.tsx) with identical geometry (`max-width: var(--generation-reading-width)`, `20px` radius, `54px` minimum textarea height, `36px` bottom toolbar, and `36×36` circular submit button).
- **Never block an input control with a loading cover**: Input composers are interactive surfaces, not data feeds. Never cover a composer with `"Loading…"` overlays; put loading indicators in the transcript, result card, or catalog region where data is actually fetched.
- **No unsolicited disclaimers or draft noise**:
  - Do not inject unsolicited provider-billing notices or `"Estimate unavailable"` strips inside the composer. Show billing/estimate rows only when a concrete priced quote is present or when an explicit confirmation dialog requires disclosure.
  - Never show `"Saving draft before leaving…"` or `"Loading saved draft…"` notices on clean session switches when the user has not edited the current draft.
- **Clear missing vs. invalid key states**:
  - When a workspace has no active key or no selected key, render a single compact `.composer-key-banner` inside the composer header with a direct CTA (`Create API key` or `Choose API key`).
  - When an explicitly referenced key is invalid, revoked, expired, or IP-restricted, render a single-surface `<GenerationComposerCover>` with recovery actions — never stack competing double banners above and inside the composer.

After a registration queue refresh or review decision, the queue, customer tab and navigation badges reflect the same pending count, including zero.

## 5. Structured Loading, Empty, and Error Surfaces

Pending settlement drilldowns preserve the source scope and filter by customer charge state before pagination, independently of execution outcome.

Returning from request details restores the inspected row, focus and loaded page depth for that log history entry. Restore only from workspaces that are still authorized.

- **No raw unstyled loading paragraphs or visible skeleton captions**: Never render bare `<p role="status">Loading…</p>` in pages or dialogs, and never render visible `"Loading…"` / `"正在加载…"` captions above skeleton shimmer bars. Use `TableSkeleton`, `FormSectionSkeleton`, `ListRowsSkeleton`, `CardGridSkeleton`, or `WorkspaceShellSkeleton` (from [`PageSkeletons.tsx`](../../apps/dashboard/app/components/PageSkeletons.tsx)) with `<span className="sr-only">{label}</span>` so screen readers receive `role="status"` announcements while sighted users see clean shimmer geometry. Overview and checklist surfaces (`/admin`, `/workspaces/:workspace`) must gate zero-resource `"Action needed"` / `"Admin setup"` warnings until their snapshot or catalog load settles, and `<Navigate>` call sites must never pass inline object literals (`state={{ ... }}` or `to={{ ... }}`), which restart React Router transitions in an infinite loop.
- **Quiet, card-free, vertically centered empty placeholders**: Never wrap empty list/table/sidebar placeholders in bulky rounded `bg-card` or `bg-muted` card slabs or decorative shadows. `<Empty>` stays transparent (`bg-transparent`, `border-0`, `w-full`) across full-width management pages, dialogs, embedded cards, and sidebars so it sits naturally on its host surface while spanning `100%` of the available width. Full-page empty states center vertically in the remaining canvas height through the shared `.empty-region` / route-level `[data-slot="empty"]` flex rules in `apps/dashboard/app/styles/surfaces.css` (never pinned to the upper half with a hardcoded `min-h` cap) and maintain relaxed proportions (`gap-5`, `text-base font-semibold leading-snug` title, `max-w-[36rem]` `text-balance` relaxed 14px description, `max-w-xl` action bar with uniform button heights and clear primary/secondary/tertiary hierarchy so desktop actions sit comfortably on a single row). Narrow sidebars and rails (such as Generations `Sessions`) override with compact padding and an unboxed muted icon (`EmptyMedia` default variant) rather than a boxed icon tile. Keep sibling configuration sections consistent with their surrounding `bg-card` peers.
- **Sibling first-run parity**: Sibling creation surfaces in Generations (`Chat` and `Video`) share the same centered mode switcher (`Chat` / `Video`), heading scale (`.playground-first-run-heading`), and `.playground-starters` / `.playground-starter` card grid (`<strong>` title, `<span>` summary, trailing arrow icon).
- **Never leak internal IDs**: Never render UUIDs/GUIDs in UI labels, tooltips, badges, dialogs, or error notices.

## 6. Primitive & Stylesheet Hygiene

- Use installed shadcn primitives (`Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Dialog`, `DropdownMenu`, `Popover`, `Sidebar`, `Tabs`, `Card`, `Badge`, `Alert`, `Table`, `Tooltip`) directly without parallel wrappers.
- Delete superseded legacy CSS classes immediately when migrating a feature to a shared component (e.g., no dead `.video-composer*` rules once unified onto `GenerationComposer`).
- Keep full-width management canvases without page-level `max-width`; reserve readable column widths strictly for the Generations transcript and composer.
- **One design layer**: Shared page gutters, header-tab placement, dialog framing, title leading, close-control space, and surface tokens belong to the shell, global stylesheet, or installed primitives. Feature code composes those defaults with tokens and utilities; it must not hand-build a parallel surface, re-declare the same dialog `max-h`/`overflow` per call site, or add a page-specific CSS patch to correct a primitive. When several pages need the same visual behavior, fix the owning primitive/global rule once and remove the local overrides.
- **Responsive multi-column catalog grids**: Full-width canvases must distribute browsable item directories (such as the public and workspace Models catalog and `CardGridSkeleton`) into a responsive multi-column card grid (`repeat(auto-fill, minmax(min(100%, 352px), 1fr))`) with equal-height cards and a consistent 3-tier vertical rhythm (header with icon + title + capability tags, clamped body summary, bottom-aligned pricing/context + action footer) rather than cramping cards at sub-300px widths or stretching individual model cards across the full desktop width. Evaluate spatial ergonomics, scan density, and visual balance across desktop, ultrawide, tablet, and mobile viewports during every review.

## 7. Delivery Verification Checklist

Before marking any UI change complete:

1. **Automated gates**: Affected Vitest suites, TypeScript checks on touched files, public-boundary check, module-size baselines, and `react-router build` pass.
2. **Real browser inspection**: Inspect rendered pages and interactive open/loading/error states in Chromium across:
   - Desktop Light (`1440×900`)
   - Desktop Dark (`1440×900`)
   - Narrow mobile (`390×844`)
3. **Zero regressions**: Verify 0 horizontal overflow, stable dialog/menu heights across loading -> loaded transitions, consistent sibling dimensions, and accessible contrast.

### Empty collections and generation prerequisites

Center a single empty result in the remaining page or pane below its controls. Keep one recovery action when several sections describe the same missing data. Keep dates and active filters reachable. Show separate sections for independently populated, loading or failed results.

A new generation requires a usable workspace key before message entry, attachments, prompt examples or submission. Preserve existing draft content when the key becomes unavailable. Offer authorized key setup at the composer and enable it only after the selected key permits invocation. Creating a key and sending a message are distinct actions.

Documentation interactive surfaces (including `/docs/api/rest/<operation>/` Try-it panels and `/docs/api/explorer/`) must render natively inside the unified Starlight sidebar and header shell using installed shadcn primitives and scoped CSS. Never embed unscoped third-party full-viewport API viewers (such as Scalar) or hide `.sidebar-pane` on documentation subroutes, which breaks layout continuity and bleeds global styles across client-side transitions.

On top-level dashboard pages partitioned by primary section tabs (including `ShellSectionTabs` workspace/activity groups such as `General | Guardrails | Events`, `Models | Routing | Evaluations`, and `Usage | Spending | Statements | Rates`, as well as admin pages such as `Customers | Registrations`, Platform Settings, Connection Incidents, Payments, and multi-mode Standard Pricing), promote the line `<TabsList>` directly into the top header bar (`#dashboard-page-tabs`), aligned flush with `.page-content` through the shared `--page-gutter` token (32/24/16px) and grounded by a subtle hairline bottom border, replacing the redundant static header title/breadcrumb while keeping an accessible `sr-only` `<h1>`. Below the desktop rail breakpoint (<=959px) the header gains a navigation toggle, so tab strips MUST wrap onto their own full-width 40px row; never let a 56px tab trigger overflow a padded 56px header row. Resolve header portal hosts in `useLayoutEffect` with an inline SSR fallback, never by reading `document` during render, and never render a second local copy of shell tabs conditionally. Never stack two rows of horizontal tabs on top of each other: exclude entity detail subroutes from `ShellSectionTabs` (preserving interactive parent breadcrumbs), and place secondary inspection/history flows (such as Guardrails `Blocked requests` and `Policy history`) as top-right header actions opening single-level dialogs with in-dialog detail subviews rather than a second horizontal tab bar.

Dialog utility buttons (such as Refresh or Load more) must never stretch full-width inside `DialogContent` CSS grids; place refresh triggers as compact icon actions alongside `<DialogHeader>` and footer buttons in `<DialogFooter>`. Pricing history dialogs must label publication notes explicitly (`Publication note:` / `发布备注：`), surface below-cost and `$0.00` warnings inline, and text standard price editors must require explicit confirmation before publishing a `$0.00` customer rate. Standard Pricing tables must surface live Provider supply readiness (`Active supply · <Provider>`, `Supply inactive`, or `No active supply`), sort active-supply models first, and provide a `DropdownMenu` supply-status filter rather than mixing unsupplied historical price rows indiscriminately with active sellable inventory.

Upstream Providers are platform-managed vendor connections rather than multi-user tenant workspaces. Provider detail (`/admin/providers/:provider`) exposes strictly two tabs — **Configuration** (`配置`, combining Business profile + Default integration, API keys, and Model access & default discount on one scannable page) and **Analytics** (`统计`, combining 90-day model/media consumption, payables, and payment history). Never expose a `Members` tab, Provider member-assignment dialog, or deletion copy referencing Provider members, and never dump the full model table onto the Configuration page by default: default to **All models** with **no discount (`100%`)**, render inline model rows only for **Allowlist** or **Blocklist** exceptions, and keep full catalog search/inspection inside the bounded **Browse models** dialog (using inline subviews rather than nested `<Dialog>`s). Scope API key dialogs on `/admin/providers/:provider` strictly to the active Provider (hiding the redundant `Provider` picker, inheriting the Provider's existing connection or `/presets` protocol/`api_base` instead of defaulting to OpenRouter, hiding `OpenRouter API` on non-OpenRouter Providers, omitting per-key integration overrides, rendering neutral `IconKey` badges on key rows instead of URL-guessed brand logos, locking built-in brand integrations as read-only presets, and limiting custom Provider integration choices to `Custom` / `New API` / `LiteLLM`). Legacy `/keys`, `/models`, `/settings`, and `/members` subroutes redirect cleanly to `/admin/providers/:provider`, and `/settlements` redirects to `/admin/providers/:provider/usage`. Across Provider lists, connection cards, and model sections, strictly distinguish **Pending setup** (`待配置`) + concrete missing prerequisite (`API key not configured` / `API 密钥未配置`, `No models imported yet` / `尚未导入模型`, `Model pricing not configured` / `模型价格未配置`) from **Disabled** (`已停用`), which applies only when saved credentials or routes exist and were explicitly turned off.

Model mapping dialogs show a single title, the editable mapping fields and visible Cancel and Save actions. Keep catalog metadata and optional capabilities under advanced settings. Show video configuration for declared video output, unknown output, or an existing saved video configuration. On model catalog cards and detail pages (`ModelTable`), use concise **`Try`** (`试用`) for single-workflow trial actions (disambiguating `Try chat` / `Try video` only when a single model exposes both simultaneously) rather than verbose `"Try in Chat"` (`在对话中试用`), `"Try in Video"` (`在视频中试用`), or `"Open Generations"` (`打开多模态生成`), preserve distinguishing date suffixes (`disambiguatedCatalogTitle`) when dated and undated sibling variants coexist, reserve **`Not published`** (`未发布`) strictly for genuinely uncallable commercial models (`callable === false`, with zero trial links), and never stamp `"Capabilities not published"` (`能力未发布`) on callable models.

Tab navigation must preserve already available data within the same authorization and resource scope. A presentation-only tab change must not revalidate unrelated route loaders. Keep slow first reads and errors local to the affected panel. Verify both cold activation and return visits with browser frames.

Workspace users discover models in one catalog. Platform administrators manage upstream Provider credentials. Never present internal funding classifications as model sources or imply that workspace users supply upstream keys. Workspace API keys authorize access to Niu.

Verify the customer catalog after staging supply qualification. Temporary upstream connections must be inactive after the review, and their test aliases must be absent when the customer reloads the model list. Retain historical request attribution.

Keep the MCP installation dialog focused on installing the server in the current client. Put task examples in the host plugin usage guide and request authorization only when the user starts a task that needs it.

Display API key last use as localized relative time in the directory and detail view. A recorded null displays “Never used” (从未使用). An omitted timestamp displays “Unavailable”.

Do not partition navigation, settings, billing, or Provider setup into `"Internal use"` vs. `"Resale"` modes. Represent self-use and internal postpaid accounts via `unlimited_credit` (`无限授信`), exposing three explicit `aria-pressed` choices (`Prepaid ($0)` / `Credit limit` / `Unlimited credit`) in `CreditEditor` and suppressing `Insufficient funds` alerts on `unlimited_credit` accounts. Keep default Standard Pricing aligned 1:1 with Provider rates across all dimensions (`prompt`, `completion`, `cached_prompt`, `cache_write_prompt`, `reasoning_completion`, and `context_tiers`), and never emit `below_cost` (`Below purchase cost`) warnings when unit rates are equal (`100%` no discount) or when active supply is absent. For active supply with comparable rates, use the exact saved selling and purchase amounts in each band. A zero selling rate against a one-nanounit purchase rate has a negative unit spread.

Multi-mode creation and configuration dialogs MUST follow top-down causal order: place the primary mode/type selector (such as `Account type`: `Personal account` / `New organization` / `Join organization` in `CreateCompany`, `Credit mode` in `CreditEditor`, or `Pricing input mode` in `CustomerCustomPriceDialog`) at the top of the form using explicit `aria-pressed` `<Button variant="outline">` choices before any mode-dependent fields — never below dependent inputs or under a bottom divider. Keep separate state variables and distinct form inputs for distinct semantic entities (`organizationName` vs. `personName`), preserve user-entered personal and organization details across mode switches without clearing or aliasing them, and pass `personName` (defaulting to the email prefix, never `organizationName`) when creating an organization owner or member identity.

### Pricing and commercial inspection

Rounded financial amounts and changes must expose their exact values to touch and keyboard users. Use a focusable amount button and a popover when precision is omitted.

Group grant history with customer inspection actions and place balance-changing actions after a menu separator. Apply this order in the directory and customer detail.

The base text rate starts at zero. Both monetary and credit editors show the inclusive range for each band, accept positive increasing token thresholds, and stop offering additional bands at 32.

Use a right-side sheet for a current price comparison. Show both comparable rates with the currency, unit, route and threshold used by the platform. Distinguish unit spread from realized gross profit and label missing evidence. Place historical revision differences behind the current comparison. Price editors show complete input-token bands and preserve dirty input through accidental dismissal. Workspace model trials present applicable customer rates separately from upstream plan descriptions.

A tab that groups multiple entity types must not show an unlabeled count for just one type. Keep counts with the entity they describe.

## Decision-focused interface copy

Registration policy and the registration review queue link directly to each other within their owning Settings and Customers tabs. Display the pending count on the review action when positive.

Use field labels, units, comparable values and action names to make workflows clear. Remove introductions that repeat a title, describe visible controls or explain unrelated product behavior. Keep concrete errors, prerequisites and irreversible consequences at the affected action.

New text price and credit tariff menus use the registered route’s text eligibility. Missing media price specifications alone never establish eligibility. Inspect route pool candidates and upstream modality metadata even when a public alias hides the underlying model name.

A catalog model can be labeled free only when the complete applicable tariff establishes zero charges, including all token categories, context tiers, the request fee and the minimum charge. Show positive per-request charges alongside token rates.

Keep the financial reporting cutoff fixed while inspecting report tabs and model details. Refreshing the report advances the cutoff. Opening unresolved items must preserve the reporting interval and focus the destination heading.

On pricing tabs, identify the mode used for billing independently of the selected tab. Browsing an inactive schedule must not imply that a publication or preparation job is running.

When an explicit pricing tab is open, keep both tab destinations available across navigation and reload, including before a credit unit is configured.

Workspace activity summaries keep the workspace, request count and charge visible at every viewport width. Long workspace names and charge amounts wrap within their cells.

Present default and custom key setup together in the confirmation dialog. A composer that opens this dialog needs only one setup action.

Organization creation derives the address from the name. Preview the organization settings destination and expose identifier constraints when editing the address.

# Niu UI & Interaction Consistency Standard

This document defines the mandatory, product-wide UI and interaction standards for the Niu dashboard. Every new or modified page, dialog, menu, composer, and status surface must conform to these rules so the product looks and behaves as one coherent system rather than a collection of ad-hoc overrides.

## 1. Visual System & Semantic Tokens

- **Single token source**: Define brand, surface, text, border, and elevation tokens in [`branding/tokens.css`](../../branding/tokens.css) and map them in [`apps/dashboard/app/styles/theme.css`](../../apps/dashboard/app/styles/theme.css). Never hardcode one-off hex colors in feature stylesheets or JSX.
- **Brand primary & contrast**: Primary actions use burnt orange-brown (`#B3471A` light / `#B84B1C` dark) with warm near-white foreground (`#FFFBF7`) for crisp readability. On dark surfaces, text links and inline error copy use `--primary-ink` and `--destructive-ink` rather than low-contrast button fill tones.
- **Warm-stone surfaces & subtle separation**: Follow Manus-style surface restraint — separate navigation, canvas, and sections with subtle solid background tones and spacing (`#FAF9F7` / `#F3F1ED` light, `#191716` / `#221F1D` dark) rather than repeated bordered cards or decorative shadows. Reserve elevation (`--shadow-composer`, `--shadow-panel`) for floating composers, popovers, menus, and dialogs.
- **Sidebar hierarchy**: Active navigation items use a clear, unmistakable fill (`#E8E3DC` light / `#2F2A26` dark) with medium-semibold ink (`--sidebar-accent-foreground`).

## 2. Stable Dialog Frames & In-Control Loading

- **Never collapse a dialog while loading secondary data**: When a dialog opens and needs to fetch choice options, saved roles, or secondary metadata, keep `DialogHeader`, form/detail structure, helper slots, and `DialogFooter` stably mounted (`0px` frame jump).
- **Show loading in place**:
  - For dropdown/choice fields whose options are loading, keep the field and trigger mounted with `aria-busy="true"`, a spinner icon (`IconLoader2` with `animate-spin`), and a clear loading label inside the trigger and/or menu.
  - For detail dialogs whose primary record is already known (such as member details), render the record immediately and scope the loading/retry state strictly to the pending section (e.g., the Role selector), never replacing the entire dialog with a generic skeleton.
  - For data-table dialogs (such as capacity inspection or archived sessions), render `TableSkeleton` inside the table slot on initial open (`rows.length === 0`) and keep existing rows visible during refreshes while reflecting busy state on the refresh/pagination button.
- **Modal discipline & field rhythm**:
  - Every page-level create, edit, rename, limit-setting, and destructive confirmation action opens an installed shadcn `Dialog` with bounded scroll (`max-h-[90dvh] overflow-y-auto` or `max-h-[85dvh]`) and restores focus via `onCloseAutoFocus`.
  - Never nest a `Dialog` inside an already-open modal; keep secondary confirmations inside modals inline.
  - Every labeled form field pairs `<Label>` (which uses `leading-snug` so CJK glyphs never clip or touch controls below) and its input/trigger inside an explicit `grid gap-2` (or `space-y-2`) container. A global zero-specificity CSS safeguard in `foundation.css` also enforces `display: grid; gap: 0.5rem;` on any unspaced block container holding a visible `<Label>` inside forms, dialogs, and popovers.

## 3. Uniform Choice, Header & Toolbar Controls

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

## 4. Unified Input & Composer Controls

- **Single shared composer across all Generations modes**: `Chat`, `New Video`, and `Video Session` MUST all render [`GenerationComposer`](../../apps/dashboard/app/features/generations/GenerationComposer.tsx) and [`GenerationComposerCover`](../../apps/dashboard/app/features/generations/GenerationComposer.tsx) with identical geometry (`max-width: var(--generation-reading-width)`, `20px` radius, `54px` minimum textarea height, `36px` bottom toolbar, and `36×36` circular submit button).
- **Never block an input control with a loading cover**: Input composers are interactive surfaces, not data feeds. Never cover a composer with `"Loading…"` overlays; put loading indicators in the transcript, result card, or catalog region where data is actually fetched.
- **No unsolicited disclaimers or draft noise**:
  - Do not inject unsolicited provider-billing notices or `"Estimate unavailable"` strips inside the composer. Show billing/estimate rows only when a concrete priced quote is present or when an explicit confirmation dialog requires disclosure.
  - Never show `"Saving draft before leaving…"` or `"Loading saved draft…"` notices on clean session switches when the user has not edited the current draft.
- **Clear missing vs. invalid key states**:
  - When a workspace has no active key or no selected key, render a single compact `.composer-key-banner` inside the composer header with a direct CTA (`Create API key` or `Choose API key`).
  - When an explicitly referenced key is invalid, revoked, expired, or IP-restricted, render a single-surface `<GenerationComposerCover>` with recovery actions — never stack competing double banners above and inside the composer.

## 5. Structured Loading, Empty, and Error Surfaces

- **No raw unstyled loading paragraphs**: Never render bare `<p role="status">Loading…</p>` in pages or dialogs. Use `TableSkeleton`, `FormSectionSkeleton`, or `ListRowsSkeleton` (from [`PageSkeletons.tsx`](../../apps/dashboard/app/components/PageSkeletons.tsx)) for initial region loading, or an in-control spinner for inline refreshes.
- **Quiet, card-free empty placeholders**: Never wrap empty list/table/sidebar placeholders in bulky rounded `bg-card` or `bg-muted` card slabs or decorative shadows. `<Empty>` stays transparent (`bg-transparent`, `border-0`, `w-full`) across full-width management pages, dialogs, embedded cards, and sidebars so it sits naturally on its host surface while spanning `100%` of the available width. Narrow sidebars and rails (such as Generations `Sessions`) use compact padding and an unboxed muted icon (`EmptyMedia` default variant) rather than a boxed icon tile. Keep sibling configuration sections consistent with their surrounding `bg-card` peers.
- **Sibling first-run parity**: Sibling creation surfaces in Generations (`Chat` and `Video`) share the same centered mode switcher (`Chat` / `Video`), heading scale (`.playground-first-run-heading`), and `.playground-starters` / `.playground-starter` card grid (`<strong>` title, `<span>` summary, trailing arrow icon).
- **Never leak internal IDs**: Never render UUIDs/GUIDs in UI labels, tooltips, badges, dialogs, or error notices.

## 6. Primitive & Stylesheet Hygiene

- Use installed shadcn primitives (`Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Dialog`, `DropdownMenu`, `Popover`, `Sidebar`, `Tabs`, `Card`, `Badge`, `Alert`, `Table`, `Tooltip`) directly without parallel wrappers.
- Delete superseded legacy CSS classes immediately when migrating a feature to a shared component (e.g., no dead `.video-composer*` rules once unified onto `GenerationComposer`).
- Keep full-width management canvases without page-level `max-width`; reserve readable column widths strictly for the Generations transcript and composer.
- **Responsive multi-column catalog grids**: Full-width canvases must distribute browsable item directories (such as the public and workspace Models catalog) into a responsive multi-column card grid (`repeat(auto-fill, minmax(272px, 1fr))`) with equal-height cards and a consistent 3-tier vertical rhythm (header with icon + title + capability tags, clamped body summary, bottom-aligned pricing/context + action footer) rather than stretching individual model cards across the full desktop width. Evaluate spatial ergonomics, scan density, and visual balance across desktop, ultrawide, tablet, and mobile viewports during every review.

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

On top-level single-crumb dashboard pages partitioned by primary section tabs (e.g. Customers `Customers | Registrations`, Platform Settings, Connection Incidents, standalone Payments, multi-mode Standard Pricing), place the line `<TabsList>` directly in the top header bar via `<PageHeader tabs={...} />` to replace the redundant static header title (retaining an accessible `sr-only` `<h1>`). Preserve top-header breadcrumbs on workspace and entity-detail pages, and keep nested sub-tabs inline via `PageHeaderTabsTargetContext.Provider value=""`.

Dialog utility buttons (such as Refresh or Load more) must never stretch full-width inside `DialogContent` CSS grids; place refresh triggers as compact icon actions alongside `<DialogHeader>` and footer buttons in `<DialogFooter>`. Pricing history dialogs must label publication notes explicitly (`Publication note:` / `发布备注：`), surface below-cost and `$0.00` warnings inline, and text standard price editors must require explicit confirmation before publishing a `$0.00` customer rate. Standard Pricing tables must surface live Provider supply readiness (`Active supply · <Provider>`, `Supply inactive`, or `No active supply`), sort active-supply models first, and provide a `DropdownMenu` supply-status filter rather than mixing unsupplied historical price rows indiscriminately with active sellable inventory.

Upstream Providers are platform-managed vendor connections rather than multi-user tenant workspaces. Provider detail (`/admin/providers/:provider`) exposes strictly two tabs — **Configuration** (`配置`, combining Business profile + Default integration, API keys, and Model access & default discount on one scannable page) and **Analytics** (`统计`, combining 90-day model/media consumption, payables, and payment history). Never expose a `Members` tab, Provider member-assignment dialog, or deletion copy referencing Provider members, and never dump the full model table onto the Configuration page by default: default to **All models** with **no discount (`100%`)**, render inline model rows only for **Allowlist** or **Blocklist** exceptions, and keep full catalog search/inspection inside the bounded **Browse models** dialog (using inline subviews rather than nested `<Dialog>`s). Legacy `/keys`, `/models`, `/settings`, and `/members` subroutes redirect cleanly to `/admin/providers/:provider`, and `/settlements` redirects to `/admin/providers/:provider/usage`. Across Provider lists, connection cards, and model sections, strictly distinguish **Pending setup** (`待配置`) + concrete missing prerequisite (`API key not configured` / `API 密钥未配置`, `No models imported yet` / `尚未导入模型`, `Model pricing not configured` / `模型价格未配置`) from **Disabled** (`已停用`), which applies only when saved credentials or routes exist and were explicitly turned off.

Model mapping dialogs show a single title, the editable mapping fields and visible Cancel and Save actions. Keep catalog metadata and optional capabilities under advanced settings. Show video configuration for declared video output, unknown output, or an existing saved video configuration. On model catalog cards (`ModelTable`), reserve **`Not published`** (`未发布`) strictly for genuinely uncallable commercial models (`callable === false`, with zero trial links); never stamp `"Capabilities not published"` (`能力未发布`) on callable models whose upstream `/v1/models` response omits optional modality metadata.

Tab navigation must preserve already available data within the same authorization and resource scope. A presentation-only tab change must not revalidate unrelated route loaders. Keep slow first reads and errors local to the affected panel. Verify both cold activation and return visits with browser frames.

# Niu public repository

Write product documentation in English. Keep the Niu brand assets and theme tokens. The product name is Niu in English UI and documentation, never niu.io or NIU.IO. Keep niu.io only as the domain in URLs and technical configuration. Use 牛元 as the Chinese brand name in Chinese-language content (Niu 牛元 when paired with the English brand); 牛刀 is the retired name.

Keep marketing source in the separate `niu-io/website` repository. Niu owns the public catalog, dashboard, docs and APIs; the hosted distribution composes their pinned artifacts under the single `niu.io` domain. Do not introduce a separate application subdomain or make community builds depend on website or private source. Follow `docs/architecture/repository-ownership.md` for route and asset ownership.

This repository contains only Niu's public project. Internal research, enterprise source, private issue URLs, local source paths, customer records, and secrets must not enter the public tree. Retain upstream copyright and license attribution for selectively reused code.

The implementation reuses individual source modules, not a complete upstream repository or its history. Keep each imported module small, traceable, independently licensed, and explicit about behavior that remains unimplemented.

## Work tracking and review follow-up

Use **Beads (`bd`) as the primary work tracker**, especially for tasks discovered during code, API and UX reviews. Run `bd prime` at session start and after compaction; use `bd ready`, `bd show <id>` and `bd update <id> --claim` before starting tracked work. Use a distinct public-safe `BEADS_ACTOR` for each concurrent worker. Keep task ownership, priority, dependencies, progress, blockers and acceptance evidence in Beads. See [the workflow](docs/development/beads.md) for setup, synchronization and handoff.

Before creating a review task, search for the existing finding/reference and update or reopen it rather than duplicating it. Record the trigger, impact, source/revision, evidence limits and observable acceptance criteria; link related findings and use blocking edges only for real prerequisites. Revalidate older findings against the current implementation before changing code. A review-only request permits review records and task capture, not product implementation.

Markdown holds durable requirements, review evidence, design decisions and dated verification records; link those records to the bead. Do not maintain a second live backlog, owner/status table or TODO checklist in Markdown. Historical review statuses remain dated evidence, with current execution state in Beads. Use GitHub Issues only when explicitly requested or needed for external/public discussion; link them to the bead instead of mirroring the backlog or automatically publishing review findings.

Keep a task open while implementation awaits verification; use a `needs-verification` label when useful. Close it only with evidence matching its acceptance scope, or an explicit duplicate/rejected/superseded disposition. In the handoff record completed work, unverified behavior, blockers and the next action. Commit the Dolt working set and refresh the portable issue snapshot; report unpushed task state honestly. Beads does not authorize git commits, remote publication, delegation or product changes beyond the active task.

## API route naming

Use a single word for each API route segment unless a compound is strictly necessary to preserve meaning or an external compatibility contract. Prefer concise resource nouns and resource hierarchy over concatenated internal type names. Apply route changes consistently to handlers, contracts, SDKs, consumers, tests and generated documentation.

## Remote development

Use SSH for authorized remote inspection and configuration transfers. Do not use Supen to inspect remote sessions or coordinate development unless the user explicitly requests it. Keep transferred credentials outside the public repository.

## Dashboard choice controls

Never use a native HTML `<select>` / `<option>` control, the shadcn Select component, or a hand-built Select/Dropdown abstraction anywhere in the product UI. This is a hard design rule, not a preference. Compose the installed shadcn `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, and the appropriate menu item primitives directly at each call site for choice menus, including single-choice form fields, workspace/model selectors, and filters. Preserve the shadcn menu item's built-in icon gutter and spacing; do not override its internal layout with local CSS. Verify each changed menu in the browser, including open state and alignment, before reporting completion.

## Shared UI components

Use the shadcn CLI as the source for standard UI primitives. Use its installed `Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Dialog`, `DropdownMenu`, `Popover`, `Sidebar`, `Tabs`, `Card`, `Badge`, `Alert`, `Table`, and `Tooltip` components directly at their call sites. Do not hand-build or add wrapper components that duplicate those controls, overlays, navigation, tables, or form primitives; do not create a parallel component library. Do not substitute raw native buttons, text fields, checkboxes, textareas, or data tables where the corresponding shadcn component exists. Keep custom components for Niu-specific behavior, page compositions with no shadcn equivalent, and branded assets. When a needed primitive is missing, install it with the shadcn CLI before considering a custom implementation.

## Icons

Use only Lucide React and Tabler Icons for product controls and navigation. Choose icons for their meaning; both libraries are allowed. Keep navigation size, stroke weight and alignment consistent, and use the same icon for the same feature across the rail, sidebar and account menu.

Consider Tabler alongside Lucide when choosing icons. Generations uses Tabler `sparkles`; Chat sessions use Tabler `message-chatbot`; `sparkle-highlight` is another suitable candidate for generative AI actions. Do not limit icon selection to Lucide or add Phosphor or IconPark.

## Workspace terminology

Use **workspace** consistently for Niu's customer-facing scope. Do not call the same Niu entity a **project** in product UI, guidance, or generated setup commands. Keep legacy `project` / `project_id` names only where required by existing API, database, or compatibility contracts; translate them to workspace terminology at the product boundary.

## UI change verification

For every UI change, run the product and inspect the rendered result in a browser at the affected route. Review both the visual hierarchy and the relevant interaction states; check a narrow viewport when the layout is responsive. Fix clipping, overflow, spacing, alignment, contrast, and inconsistent components before considering the change complete. A passing build or test suite alone does not verify UI work.

## Reference-led UI design

Implement visual changes directly with the installed shadcn primitives, existing Niu brand tokens, and inspected mature-product references. Verify the rendered result and interaction states in the browser. Do not introduce a mandatory external design-generation step or treat mock data and unsupported capabilities as product requirements.

This is mandatory for every UI task: do not invent a new UX pattern or visual layout. Borrow an existing, proven pattern from a mature product. For features comparable to OpenRouter, use OpenRouter as the default reference unless the user names another product. Inspect the actual relevant page and interaction states before editing; do not work from memory or call a loosely inspired redesign a faithful implementation.

Follow established patterns from mature products rather than inventing layouts based on personal design judgment. When the user supplies a product or page to copy, inspect the actual reference before implementation and treat its page structure, visual hierarchy, spacing, and interactions as requirements, not loose inspiration. Preserve Niu's brand tokens, shared components, and established navigation shell around the referenced content layout. Reuse existing components before introducing custom ones. Do not fabricate data or capabilities to imitate a reference.

Before delivery, compare the rendered result directly against both the reference and equivalent Niu pages at desktop and narrow widths. Fix visible deviations and inconsistencies within the authorized scope; do not merely describe them or wait for the user to point them out. If a departure is required by a concrete product or technical constraint, explain that constraint rather than silently substituting a new design. When no reference is supplied, inspect a relevant established product pattern before choosing a new layout.

## Navigation hierarchy

For a feature that needs two navigation levels, use sidebar items for the first-level sections and tabs within the selected section for the second level. Keep the product rail for top-level product areas; do not use rail items as the feature's first-level section list. Use the installed shadcn Sidebar and Tabs primitives directly, preserve clear active states, and verify the hierarchy and access to both levels at narrow widths.

## Surface styling

Dashboard management pages use the full available content width between navigation and canvas padding. Never add a fixed page width, centered bounded canvas, or page-level max-width. Only the Generations chat reading column may retain a readable maximum width. Dialogs and individual form controls may use appropriate bounded widths. Apply this rule to design briefs and the shared design system.

Model lists use a directly visible filter field in the first toolbar row, alongside list actions; they are exempt from the secondary-search popover rule. Search is a secondary action outside Logs. Show a compact search icon that opens an installed shadcn Popover search panel; do not leave large search fields permanently visible in page or sidebar layouts. Keep active filters apparent on the trigger, preserve the query when closing, and support keyboard focus and dismissal. Logs may retain a directly visible search field. Search fields inside an already opened choice menu or dialog remain appropriate.

Use Manus as the reference for the shared visual treatment of agent-product surfaces. Prefer subtle solid background tones and spacing to separate navigation, content, and sections. Avoid repeated bordered cards and decorative shadows. Reserve elevation for floating panels, menus, and dialogs; retain meaningful input, focus, selection, and data-table affordances. Preserve Niu branding and use shared theme rules rather than page-by-page overrides.

## Status and list information

Design management lists around the decision users need to make. Every column and status must distinguish meaningful outcomes or support a concrete action. Do not expose a backend field merely because it exists, or display universal labels such as “Configuration saved” on lists containing only saved records.

Keep API credential presence, configuration, current Provider and offer qualification, supply readiness, live upstream verification, and workspace selling eligibility distinct. An API key or enabled route does not establish sellable inventory. Derive supply readiness from current approved, active model/rate offers and their matching enabled routes and credentials. Customer selling prices and authorization remain workspace-specific. Show missing requirements and link to the relevant remedy; never infer a positive state when evidence is unavailable.

## Provider terminology

Use **Provider** consistently for model-supply businesses, upstream API services/adapters, offers, memberships, earnings and settlements. Preserve existing API, route and storage contracts, including legacy supplier-named identifiers.

## Internal identifiers

Never display internal GUIDs/UUIDs in product UI, including shortened IDs, secondary labels, tooltips, menus, dialogs, and raw-data panels. Use meaningful names, dates, or user-facing references instead. Keep internal identifiers in API contracts, routing, storage, and diagnostic logs; they are not user-facing content. Do not substitute an ID when a display name is missing.

## Readable product URLs

Use durable, human-readable slugs for named product resources in browser paths and query scopes, including workspaces, Providers, and API key detail pages. Call the public field `slug`. Generate suggestions from names, normalize whitespace and punctuation, and transliterate Chinese to lowercase pinyin without tones. Preserve user edits, handle collisions, and keep saved slugs stable across display-name changes. Keep UUIDs in existing API, authorization, and storage contracts; preserve old bookmarks with authorized resolution and canonical redirects. Do not derive a URL from private prompt content. See `docs/reference/readable-product-urls.md` for the route audit and remaining record-reference migration.

## Durable product data

The backend is the source of truth for saved product data, including Chat sessions, messages, responses, settings, and attachments. Browser storage may only be a disposable cache. Clearing it or using another browser must not lose saved data. Never replace backend persistence with browser-only storage as a shortcut.

## Commercial data boundaries

Provider purchase prices, upstream expenses, procurement budgets, and platform margins are confidential platform information. Never show them in customer workspace pages, Chat, Observability, usage reports, exports, or customer API responses. Customer billing and request costs mean customer-facing charges only; never substitute supplier cost when a customer charge is unavailable. Keep procurement controls in platform administration, and restrict providers to their own agreed rates and settlements. Enforce these boundaries in backend authorization and response serialization, not merely by hiding UI elements. Installation administrator access does not justify mixing procurement information into customer-facing workspace screens.

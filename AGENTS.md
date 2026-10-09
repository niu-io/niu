# Niu public repository

Write product documentation in English. Keep the niu.io brand assets and theme tokens. English product UI uses NIU.IO without the Chinese name. Use 牛元 as the Chinese brand name in Chinese-language content (NIU.IO 牛元 when paired with the English brand); 牛刀 is the retired name.

Keep marketing source in the separate `niu-io/website` repository. Niu owns the public catalog, dashboard, docs and APIs; the hosted distribution composes their pinned artifacts under the single `niu.io` domain. Do not introduce a separate application subdomain or make community builds depend on website or private source. Follow `docs/architecture/repository-ownership.md` for route and asset ownership.

This repository contains only Niu's public project. Internal research, enterprise source, private issue URLs, local source paths, customer records, and secrets must not enter the public tree. Retain upstream copyright and license attribution for selectively reused code.

The implementation reuses individual source modules, not a complete upstream repository or its history. Keep each imported module small, traceable, independently licensed, and explicit about behavior that remains unimplemented.

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

Use Stitch for frontend visual design and iteration. Reuse the existing NIU.IO Stitch project and design system; give Stitch the actual mature-product reference, supported workflow, current screen and Niu constraints before requesting a design. Implement and browser-verify the resulting design with the installed shadcn primitives and existing brand tokens. Do not substitute an independently invented layout or treat generated mock data and unsupported capabilities as product requirements. If Stitch is unavailable, report the blocker before making visual design changes; functional fixes may continue within the established layout.

This is mandatory for every UI task: do not invent a new UX pattern or visual layout. Borrow an existing, proven pattern from a mature product. For features comparable to OpenRouter, use OpenRouter as the default reference unless the user names another product. Inspect the actual relevant page and interaction states before editing; do not work from memory or call a loosely inspired redesign a faithful implementation.

Follow established patterns from mature products rather than inventing layouts based on personal design judgment. When the user supplies a product or page to copy, inspect the actual reference before implementation and treat its page structure, visual hierarchy, spacing, and interactions as requirements, not loose inspiration. Preserve Niu's brand tokens, shared components, and established navigation shell around the referenced content layout. Reuse existing components before introducing custom ones. Do not fabricate data or capabilities to imitate a reference.

Before delivery, compare the rendered result directly against both the reference and equivalent Niu pages at desktop and narrow widths. Fix visible deviations and inconsistencies within the authorized scope; do not merely describe them or wait for the user to point them out. If a departure is required by a concrete product or technical constraint, explain that constraint rather than silently substituting a new design. When no reference is supplied, inspect a relevant established product pattern before choosing a new layout.

## Navigation hierarchy

For a feature that needs two navigation levels, use sidebar items for the first-level sections and tabs within the selected section for the second level. Keep the product rail for top-level product areas; do not use rail items as the feature's first-level section list. Use the installed shadcn Sidebar and Tabs primitives directly, preserve clear active states, and verify the hierarchy and access to both levels at narrow widths.

## Surface styling

Model lists use a directly visible filter field in the first toolbar row, alongside list actions; they are exempt from the secondary-search popover rule. Search is a secondary action outside Logs. Show a compact search icon that opens an installed shadcn Popover search panel; do not leave large search fields permanently visible in page or sidebar layouts. Keep active filters apparent on the trigger, preserve the query when closing, and support keyboard focus and dismissal. Logs may retain a directly visible search field. Search fields inside an already opened choice menu or dialog remain appropriate.

Use Manus as the reference for the shared visual treatment of agent-product surfaces. Prefer subtle solid background tones and spacing to separate navigation, content, and sections. Avoid repeated bordered cards and decorative shadows. Reserve elevation for floating panels, menus, and dialogs; retain meaningful input, focus, selection, and data-table affordances. Preserve Niu branding and use shared theme rules rather than page-by-page overrides.

## Supplier terminology

Use **Supplier** for model-supply businesses, their offers, memberships, earnings and settlements. Keep **Provider** for upstream API services/adapters such as OpenRouter and OpenAI. Preserve existing provider-named API, route and storage contracts; apply Supplier terminology at the business-facing product boundary.

## Internal identifiers

Never display internal GUIDs/UUIDs in product UI, including shortened IDs, secondary labels, tooltips, menus, dialogs, and raw-data panels. Use meaningful names, dates, or user-facing references instead. Keep internal identifiers in API contracts, routing, storage, and diagnostic logs; they are not user-facing content. Do not substitute an ID when a display name is missing.

## Durable product data

The backend is the source of truth for saved product data, including Chat sessions, messages, responses, settings, and attachments. Browser storage may only be a disposable cache. Clearing it or using another browser must not lose saved data. Never replace backend persistence with browser-only storage as a shortcut.

## Commercial data boundaries

Supplier purchase prices, upstream expenses, procurement budgets, and platform margins are confidential platform information. Never show them in customer workspace pages, Chat, Observability, usage reports, exports, or customer API responses. Customer billing and request costs mean customer-facing charges only; never substitute supplier cost when a customer charge is unavailable. Keep procurement controls in platform administration, and restrict suppliers to their own agreed rates and settlements. Enforce these boundaries in backend authorization and response serialization, not merely by hiding UI elements. Installation administrator access does not justify mixing procurement information into customer-facing workspace screens.

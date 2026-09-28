# Niu public repository

Write product documentation in English. Keep the niu.io brand assets and theme tokens.

Keep marketing source in the separate `niu-io/website` repository. Niu owns the public catalog, console, docs and APIs; the hosted distribution composes their pinned artifacts under the single `niu.io` domain. Do not introduce a separate application subdomain or make community builds depend on website or private source. Follow `docs/architecture/repository-ownership.md` for route and asset ownership.

This repository contains only Niu's public project. Internal research, enterprise source, private issue URLs, local source paths, customer records, and secrets must not enter the public tree. Retain upstream copyright and license attribution for selectively reused code.

The implementation reuses individual source modules, not a complete upstream repository or its history. Keep each imported module small, traceable, independently licensed, and explicit about behavior that remains unimplemented.

## Console choice controls

Never use a native HTML `<select>` / `<option>` control, the shadcn Select component, or a hand-built Select/Dropdown abstraction anywhere in the product UI. This is a hard design rule, not a preference. Compose the installed shadcn `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, and the appropriate menu item primitives directly at each call site for choice menus, including single-choice form fields, workspace/model selectors, and filters. Preserve the shadcn menu item's built-in icon gutter and spacing; do not override its internal layout with local CSS. Verify each changed menu in the browser, including open state and alignment, before reporting completion.

## Shared UI components

Use the shadcn CLI as the source for standard UI primitives. Use its installed `Button`, `Input`, `Textarea`, `Checkbox`, `Label`, `Dialog`, `DropdownMenu`, `Popover`, `Sidebar`, `Tabs`, `Card`, `Badge`, `Alert`, `Table`, and `Tooltip` components directly at their call sites. Do not hand-build or add wrapper components that duplicate those controls, overlays, navigation, tables, or form primitives; do not create a parallel component library. Do not substitute raw native buttons, text fields, checkboxes, textareas, or data tables where the corresponding shadcn component exists. Keep custom components for Niu-specific behavior, page compositions with no shadcn equivalent, and branded assets. When a needed primitive is missing, install it with the shadcn CLI before considering a custom implementation.

## Workspace terminology

Use **workspace** consistently for Niu's customer-facing scope. Do not call the same Niu entity a **project** in product UI, guidance, or generated setup commands. Keep legacy `project` / `project_id` names only where required by existing API, database, or compatibility contracts; translate them to workspace terminology at the product boundary.

## UI change verification

For every UI change, run the product and inspect the rendered result in a browser at the affected route. Review both the visual hierarchy and the relevant interaction states; check a narrow viewport when the layout is responsive. Fix clipping, overflow, spacing, alignment, contrast, and inconsistent components before considering the change complete. A passing build or test suite alone does not verify UI work.

## Reference-led UI design

Follow established patterns from mature products rather than inventing layouts based on personal design judgment. When the user supplies a product or page to copy, inspect the actual reference before implementation and treat its page structure, visual hierarchy, spacing, and interactions as requirements, not loose inspiration. Preserve Niu's brand tokens, shared components, and established navigation shell around the referenced content layout. Reuse existing components before introducing custom ones. Do not fabricate data or capabilities to imitate a reference.

Before delivery, compare the rendered result directly against both the reference and equivalent Niu pages at desktop and narrow widths. Fix visible deviations and inconsistencies within the authorized scope; do not merely describe them or wait for the user to point them out. If a departure is required by a concrete product or technical constraint, explain that constraint rather than silently substituting a new design. When no reference is supplied, inspect a relevant established product pattern before choosing a new layout.

## Supplier terminology

Use **Supplier** for model-supply businesses, their offers, memberships, earnings and settlements. Keep **Provider** for upstream API services/adapters such as OpenRouter and OpenAI. Preserve existing provider-named API, route and storage contracts; apply Supplier terminology at the business-facing product boundary.

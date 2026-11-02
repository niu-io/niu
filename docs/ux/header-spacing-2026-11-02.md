# Shared dashboard header spacing

Dated verification: 2026-11-02. Bead: `niu-dfd`. Source: `7354c070f` with existing working-tree changes preserved. Scope: shared dashboard management chrome and its first content inset, not a page redesign.

## Purpose and decision

The header identifies the workspace and destination, exposes navigation, and hosts existing page actions. The content area holds the user's task: inspecting requests, configuring a workspace, or reading a named resource. Preserve these roles and their existing controls.

Use the existing sidebar surface token for a solid header distinct from the content background. Reduce shared header height from 64px to 56px, desktop content top inset from 28px to 24px, phone inset from 20px to 16px, and page-heading bottom spacing from 30px to 24px. Keep the existing container-based horizontal gutters and full-width management canvas. Reset the top margin of a legacy panel when it is the first route element: its extra 14px duplicated the canvas inset on details.

## Criteria and references

- Published guidance: [NN/g visual design principles](https://www.nngroup.com/articles/principles-visual-design/) describes hierarchy through placement, value and spacing, contrast between functional regions, and proximity grouping. These support distinguishable navigation and task regions; they do not prescribe Niu's pixel values.
- Inspected reference: [Manus](https://manus.im/app), settled desktop application and expanded model menu. Borrow its quiet solid surfaces and compact persistent controls, not its home-page composition.
- Inspected reference: [OpenRouter models](https://openrouter.ai/models), desktop page and expanded sorting menu. Navigation and the content toolbar have separate roles with a compact transition.
- Niu requirements: existing theme tokens and shared primitives, no decorative elevation, full available content width, responsive browser inspection, and direct choice-menu primitives. This change adds no controls or wrappers.

## Rendered evidence

Local development environment, existing demo workspace, Chinese UI. The development-only mock-payment notice is separate chrome above the header; it was retained during inspection. Sizes below are CSS pixels, not screenshot pixels.

| Surface / viewport | Available composition and observed result |
| --- | --- |
| Logs, 1440 × 800, navigation expanded | Main lane starts at x=324; scrollbar leaves 1101px inner width. Header is 56px with 32px horizontal insets; actions occupy 164 × 39px in one row. Content begins 24px below the header with the same horizontal inset. No document horizontal overflow. |
| Logs, 900 × 780, navigation closed | Inner width 825px; 25.2px horizontal insets; 56px header, 24px content top inset. Table adapts to its existing narrow presentation. Navigation drawer opens and dismisses without covering the content permanently. |
| Settings, 1100 × 800, navigation expanded and closed | Expanded lane 776px with 23.28px horizontal insets; closed lane 1032px with 30.96px insets. Header remains 56px; fields and actions remain reachable. No fixed page-width constraint added. |
| Logs and settings, 390 × 844 | Header is 56px and content inset is 16px. Logs inner width is 375px after scrollbar. Header actions use their existing compact presentation. No document horizontal overflow on logs. |
| Key details, desktop and 390 × 844 | Desktop dark/light and phone dark inspected. Final phone measurement: exactly 16px from header bottom to first panel, 56px header, no document horizontal overflow. Previously the first panel added 14px. |

Viewport budget on desktop logs: 800px viewport → main lane 1116px wide → 68px development notice + 56px header → 24px content inset → filter toolbar, histogram and several request rows visible; further records continue below the fold. On phone logs: 844px viewport → full-width main lane → 108px wrapped development notice + 56px header → 16px content inset → toolbar, histogram and request rows. The notice is development configuration, not introduced spacing. The same compact boundary remains visible in light and dark themes.

## Scoped interaction ledger

| Control | Observed effect / return |
| --- | --- |
| Workspace navigation toggle | Expanded/collapsed navigation at desktop; drawer opened at intermediate/phone widths; Escape dismissed drawer and returned to content. |
| Header workspace switch | Opened existing workspace choice menu with current selection; Escape dismissed it. Workspace selection behavior is unchanged and was not exercised against another workspace. |
| Header page switch | Opened destination menu on desktop and phone; current page check aligned on the right. Escape closed it and focus returned to the trigger. |
| Refresh requests | Reloaded request list; existing count and content remained available. |
| Denied requests | Opened interception records; existing Open logs link returned to logs. |
| Theme submenu | Light theme selected for inspection; original System preference restored afterward. |

Task completeness: existing orientation, navigation and header actions remain available in the sampled journeys. No new capability is implied. Visual composition: pass for the shared boundary, alignment and reduced accumulated spacing in sampled states. Interaction/technical correctness: scoped safe interactions and keyboard dismissal passed. This is not a full audit of page-specific forms, destructive actions or all application routes.

## Validation and limits

- Dashboard TypeScript check passed.
- AppLayout integration suite: 54 tests passed.
- Direct Vite production build passed, including after the final CSS change.
- Scoped diff whitespace check passed.
- Standard dashboard build remains blocked by nine existing untranslated-template findings in other feature files. Local visual verification used a direct Vite build and the managed development runtime; the translation gate was not changed.
- Screenshots were captured outside the public repository. No credentials, private environment configuration or demo request records were added to the public tree.
- Changes and Beads state are local; no source commit, deployment or remote task publication was performed.

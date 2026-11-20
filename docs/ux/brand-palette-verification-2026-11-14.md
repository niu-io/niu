# Dashboard brand palette verification — 2026-11-14

Bead: `niu-mopr`. Baseline: `2073027a`.

The user requested a color refinement while retaining the existing visual style,
then specified direct reuse of the logo palette and equal breadcrumb font sizes.
Dashboard overrides now reference the artwork manifest's tangerine `#FF914D`,
ink `#45352F`, lettering `#EFE2DA`, dark `#121314` and light `#FAFAF9`.
Surface tints mix these existing colors. Filled primary actions use tangerine
with ink text; small light-theme links use ink for legibility. Status colors and
chart categories retain their independent meanings. Deployment primary colors
continue to take precedence. Shared catalog/docs tokens and artwork are unchanged.
The current breadcrumb heading inherits its parent's 14px font size.

Reference: inspected the actual Manus homepage and composer, preserving its
restrained neutral surfaces and clear primary action, with Niu's own colors.

Current-input browser inspection used the actual Dashboard with live gateway
responses at `/workspaces/default`, including loaded metrics and recent requests.
Inspected desktop (1353px), intermediate (1100px/900px), and narrow (390px)
frames, light/dark appearances, collapsed navigation, metric menu opening and
Escape dismissal/focus return. Measured breadcrumb ancestor/current sizes:
14px/14px. Narrow document width matched the 390px viewport.

Review criteria: ux-review visual-review.md, NN/g consistency and hierarchy,
and WCAG 2.2 contrast/reflow. Observed: existing hierarchy, spacing and data
semantics survive; brand orange emphasizes the main action, body text stays
readable, and menu items retain their check alignment. These observations are
bounded to the inspected route/states, not an all-page accessibility audit.
SDK build and Dashboard TypeScript compilation completed. No fixture outcomes
were used as evidence. Production deployment and all other Dashboard routes
remain unverified by this record.

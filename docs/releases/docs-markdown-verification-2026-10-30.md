# Documentation Markdown verification — 2026-10-30

Bead: `niu-rsg`. Scope: documentation typography, fenced-code presentation and Markdown table layout.

## Reference and requirements

Inspected the actual [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), including Shell and TypeScript tab states, prose, tables and callouts. Retained its established content hierarchy and understated code framing while preserving Niu tokens and navigation. This is a scoped presentation change; request examples and API behavior are unchanged.

The ux-review visual-review rules require separate composition and rendered-integrity evidence. [WAI content structure](https://www.w3.org/WAI/tutorials/page-structure/content/) informs preservation of heading/list/table relationships; [WCAG keyboard and focus requirements](https://www.w3.org/TR/WCAG22/#keyboard-accessible) inform keyboard checks. These are published standards. The specific font sizes, spacing and palette are design choices within Niu's existing theme, not WCAG mandates. No full accessibility conformance claim is made.

## Changes and observed evidence

- Body: 16px; English line height 1.75 and Chinese 1.85. Chinese computed line height is 29.6px. Section spacing and label weights distinguish headings, labels and supporting prose.
- Code: existing Shiki highlighting now uses explicit GitHub dark/light themes selected by Niu's theme attribute. Shell and TypeScript labels are visible; explicit author titles/frame choices are preserved. Six distinct computed token colors were observed in each theme on the SDK guide. Inline-code treatment excludes fenced blocks.
- Tables: native table sizing is retained inside a keyboard-focusable horizontal scroll container. The spending-controls table and header both measure 679px in a 679px container on desktop; narrow table width is 341px. This repairs the previous empty strip beside naturally sized columns.
- Visual composition: observed pass on request-detail bullets, SDK code blocks and spending controls. Labels remain aligned with their explanations; code language titles are secondary to code; table rows have consistent padding and full-width separators.
- Rendered integrity: observed pass at viewport widths 1280, 960 and 390px. Article widths were 681, 645 and 343px respectively. At 1280px, the sidebar and contents rail remain separate from the reading column; at 960px the contents rail collapses; at 390px the reading lane retains 343px and navigation becomes an overlay. No document-level horizontal overflow was measured. Long code scrolls within its own block (341px visible, 430–567px content in sampled blocks).
- Interaction: clicking Copy to clipboard and activating it with Enter both show Copied!; Tab/Shift+Tab reaches the copy action with a 2px focus outline and a 32px target. Theme selection changes token colors without changing code content. The narrow navigation overlay opens and Escape dismisses it, preserving the reading position. Browser error logs were empty on the final SDK guide check. Clipboard contents were not independently inspected.
- Build: `pnpm --filter @niu-io/docs build` passed, including generated API verification and 921 static pages. `git diff --check` passed.

## Screenshots and limits

[Dark code](evidence/docs-markdown-2026-10-30/code-dark.png), [light code](evidence/docs-markdown-2026-10-30/code-light.png), [narrow request details](evidence/docs-markdown-2026-10-30/list-narrow.png).

Verification covers local built documentation. It does not establish deployment, every generated page's visual quality, or highlighting of custom React examples outside Markdown. Source and task state have not been published remotely.

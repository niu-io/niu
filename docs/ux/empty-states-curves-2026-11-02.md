# Empty-state alignment, chart curves and Generations notice

Verification date: 2026-11-02. Source: `a1b9e0f41` with existing working-tree changes preserved. Beads: `niu-ua6` (empty alignment), `niu-5z2` (curves), `niu-c4u` (notice follow-up). Current execution state belongs in Beads.

## Purpose and decisions

Empty placeholders explain a missing collection, unavailable scope or first-use prerequisite and preserve the relevant recovery action. Their content group must be vertically centered in the space available after headings, toolbars and tabs. In panels, menus and dialogs, the available region is that container rather than the entire page.

The installed Empty primitive already centers its children. The main cause of top-aligned page placeholders was missing flex-height propagation through both route wrappers. The shared management content lane and active route wrappers now pass remaining space to their children; the embedded documentation layout retains its own sizing. Existing list compositions use an `empty-region` layout class where needed. Ad hoc page/list/history/archive placeholders now use the installed Empty primitives directly. Existing field values, actions, copy and data contracts are preserved.

The shared mock-payment notice is published through DashboardContext so Generations can place the same notice element after its route-owned toolbar. The shell renders it after the shared header on other routes. Exactly one notice is rendered; dismissal remains owned by AppLayout. Chat and Video use the same ordering and local container gutters.

All dashboard line/area report call sites use monotone interpolation and round stroke caps/joins. Repository inspection found two implementations: request history in ActivityCharts and daily workspace sparklines in WorkspaceDirectory. Bucket data and tooltip values are unchanged; the existing bar reports retain their representation.

## Reference and criteria

- [OpenRouter models](https://openrouter.ai/models) was inspected with an unmatched model search: toolbar and filters remain available, with the empty message centered in its results region. Niu extends the region to available page height per the user's explicit requirement rather than copying that reference's shorter fixed results box.
- [NN/g visual design principles](https://www.nngroup.com/articles/principles-visual-design/) informs grouping related explanation/actions and preserving the hierarchy between navigation, controls and results. The requested vertical alignment and Niu spacing tokens are project decisions, not published universal pixel requirements.
- [Recharts Area API](https://recharts.github.io/en-US/api/Area/) documents the interpolation option. [D3 monotone curves](https://d3js.org/d3-shape/curve#curveMonotoneX) describes interpolation that preserves monotonicity between samples without introducing additional local extrema. This is preferable to adding decorative oscillations to count reports.
- Existing Niu requirements apply: shared shadcn controls, full available management width, direct choice menus, existing theme tokens, browser validation and retained recovery controls.

## Rendered composition evidence

Local persisted development data was used, including a real workspace with no API keys. No records were deleted or fabricated to produce empty states. Workspace UI was checked in Chinese; an isolated installation administration session was checked in English.

| Surface / state | Observed composition |
| --- | --- |
| Evaluations, 1440 × 800, navigation expanded, dark | Header 56px. Empty region starts at y=236, is 492px high and 1052px wide. Its title, explanation and existing actions are centered together; the page heading stays above it. |
| Library, 1100 × 800 and 390 × 844 | Explanatory copy and search/media/refresh controls stay at the top. Phone empty region starts at y=324 and is 480px high; content group is centered. Intermediate and phone screenshots show no clipping. |
| Model search, 1100 × 800, filters expanded | Result region 544px high; empty child 440px high below search/count controls. Clearing filters restores 20 visible model cards. |
| API keys, unmatched search and genuinely empty workspace | Unmatched result region 490px high; first-use region 510px high on desktop. Search, count and creation entry remain available. Phone and light/dark states inspected. |
| Guardrail denials | Region 478px high below explanatory copy at intermediate desktop width; icon/message group centered. |
| External detector configuration | Empty region 396px high below the introduction at the normal desktop viewport. Missing-configuration explanation and its disabled Add action are grouped at the center; save remains disabled. |
| Billing statements tab | Empty child 358px high inside the remaining statement panel; section title and tabs remain above it. |
| Admin model pools, 1280 × 720 and 390 × 844 | Desktop empty child 340px high below scope/search controls. Phone wraps the existing toolbar and keeps both description and create action reachable. |
| Key source-IP history dialog | Missing-history message centered between header and footer on desktop and phone; close controls remain visible. |
| Generations Chat and Video, desktop and phone | Toolbar bottom y=57; notice top y=73, a 16px gap. Exactly one notice. Composer and history remain available; phone content scrolls above the composer. |
| Populated overview, desktop and phone | Actual request-count path contains cubic curve commands and round caps/joins. Tooltip keyboard navigation reports the original time bucket and count. No new chart data introduced. |
| Workspace directory, desktop and phone | All three existing daily sparklines contain cubic curve commands, with rounded strokes and existing numeric totals. |

Viewport budget examples: evaluations at 1440 × 800 → 1116px main lane after navigation → 56px header + 84px notice/inset → 24px content inset + 72px bottom padding → heading and a 492px empty region. Library on phone at 390 × 844 → full-width content lane → 56px header + wrapped notice → description/toolbar → 480px empty region. These are measured allocations, not target percentages. Long content can scroll; centering does not clip the top of a short viewport.

## Interaction evidence

- Model search: unmatched query produced the centered state; Clear filters restored populated cards.
- API-key search: Popover opened, unmatched query persisted after Escape, Clear search restored the table.
- Library media choice menu: opened with the current choice checked on the right; Escape dismissed it. Existing controls and spacing were retained.
- Admin model pool empty action: Create model pool opened the existing editor at phone width; Escape returned to the list without saving.
- Generations notice: dismissed through its existing button; Chat and Video shared the same placement. No model request was submitted during verification.
- Request chart: keyboard ArrowRight exposed the original bucket `10-06 17:26–21:52` with count zero; the curve is a display interpolation, not a fabricated measurement.

Task completeness: the sampled empty journeys retain their recovery/navigation controls. Visual composition: page placeholders fill the remaining lane, while bounded placeholders center within their panels. Interaction correctness: safe filters, recovery and overlay checks passed as recorded above. Functional and visual conclusions are separate; neither a passing typecheck nor a screenshot alone establishes both.

## Validation and limits

- Dashboard typecheck passed.
- First targeted batch: 132 tests in 9 files passed.
- Billing, keys, pricing, account and playground batch: 267 tests in 23 files passed.
- Provider business, guardrails and operator batch: 144 tests in 17 files passed. Guardrails were rerun after the final action grouping correction.
- Standard production build passed, including the full translation audit. Scoped whitespace checks passed.
- Browser coverage is sampled by layout family rather than every possible empty database result. Audit logs were populated in the local data, so their populated layout and category menu were inspected; the empty branch uses the same region/primitives and is covered by source/type validation, not a claimed empty-data browser run.
- Screenshots remain outside the public tree. No credentials or private environment data were added to source or this record. No source commit, deployment or remote Beads publication was performed by this worker.

Final regression verification: all 53 guardrail tests passed after retaining the same empty-state Add button across detector-description loading. Replacing the button at that transition had caused three interaction tests to fail; the loaded/unloaded states now preserve the trigger's identity and the original consent flow. The final production build includes this correction.

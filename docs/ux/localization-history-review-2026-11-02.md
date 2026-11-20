# Localization and Generations history verification

Reviewed 2026-11-02 against the working tree for 0.3.0. Execution references: `niu-oc4`, `niu-eub`, `niu-e44`. This is dated acceptance evidence, not a live backlog.

## Task and scope

An administrator needs to compare customer balance columns and read financial periods in the selected language. A Generations user needs to recognize saved conversations immediately on return, with a cold loading state shaped like the actual navigation. Customer names and saved prompts remain customer data; localization does not rename them. Backend persistence remains authoritative.

The balance table used a local top-alignment override on its name cell while all other cells used the installed Table primitive's middle alignment. Headers assembled through an array escaped the original localization audit. Reports also built English period labels and missing-value text in helpers. The audit now follows mapped literal arrays, indexed label dictionaries, local helper returns and fallback branches, checks dictionary keys behind translated lookups, and rejects fixed English date/currency-name formatters. Brand names, protocol units and customer strings retain explicit boundaries.

Generations history previously lived only in mounted component state, and four independent history reads ran sequentially per workspace. Its disposable shared cache now scopes snapshots by authenticated authority and accessible workspace set, renders warm snapshots before refreshing, coalesces chat reads and runs independent reads concurrently. Chat writes invalidate related history. Existing shared sign-out/authority invalidation clears cached snapshots. Refresh failures retain previously loaded history with feedback. The installed SidebarMenuSkeleton now matches the icon-and-title navigation row instead of a two-column management-list placeholder.

## Review criteria and observations

| Criterion and source | Observed result |
| --- | --- |
| Consistency and visible feedback: [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Seven account cells use middle alignment; all headers are translated. Reports use localized month/day comparisons while retaining UTC accounting windows. Failed history refresh keeps existing entries and exposes retry feedback. |
| Hierarchy and grouping: [NN/g visual design principles](https://www.nngroup.com/articles/principles-visual-design/) | Management tables retain the existing Niu hierarchy and full-width canvas. Cold history placeholders use the same single-line icon/title grouping as settled sidebar rows. |
| Keyboard and modal behavior: [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Account action menu opens and dismisses by keyboard. The settled narrow Generations history panel preserves its title, close action, conversation actions and archive entry without clipping. |
| Reference and Niu constraints | Inspected the anonymous [OpenRouter chat](https://openrouter.ai/chat) loading surface for sidebar reading geometry and the existing Niu session rows. Reused installed Sidebar primitives and Niu tokens; no new navigation pattern or component library was introduced. Signed-in OpenRouter conversation behavior was not part of this reference evidence. |

## Verification evidence

The full dashboard suite passed 122 files and 1,045 tests after the cache changes; follow-up focused checks cover language dictionaries, helper returns, period rendering, account boundaries and saved chat settings. The i18n audit has no baseline waivers and is part of the dashboard build. SDK checks and generated API validation are separate checks.

Browser inspection covered account balances with a read-only fixture at 1440px and 390px, including the open action menu. All seven computed vertical alignments were `middle`. Financial reports were inspected in Chinese at desktop/narrow widths, including generated period comparisons. A delayed-response Generations test verified cold placeholders at 32px row height and warm history visible while the next response remained blocked. The final narrow panel was inspected after its transition settled; no text clipping remained. Admin and workspace sibling surfaces were also inspected in Chinese at 1280px and 390px. These UI fixtures did not issue inference or move funds.

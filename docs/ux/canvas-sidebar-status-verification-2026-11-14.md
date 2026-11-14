# Compact canvas, sidebar and status verification — 2026-11-14

Findings: `niu-w5fa`, `niu-mm90.6`, `niu-mm90.48`, `niu-mm90.49`, `niu-mm90.50`, `niu-mm90.51`. Starting release revision: `4d13fcce`. This is a scoped continuation of the staging UX review and the user's explicit feedback about sidebar alignment, redundant status prefixes and overly vivid example cards. No model request or payment was dispatched by this review.

## Canvas and composer

At a 1024 px browser width, expanded primary navigation and left session history leave a 464 px generation canvas. The previous key label still used viewport breakpoints, and the workspace link's flex text could be clipped to a fragment. Reuse the existing compact phone treatment based on the session container: a 36 px key trigger, a two-line identity, and a truncating workspace span with reserved space. Secondary actions remain in the existing overflow menu. At the smallest canvases, Sessions keeps its icon, accessible name and title while its visible label yields space to the session identity.

Actual staging-backed Chat and saved Video rendered the 464 px canvas with a 36 px key trigger and a readable Default workspace name. The Chat key dialog opened from that compact trigger; Escape returned focus to it. Desktop and narrow frames were inspected for hierarchy, grouping and clipping. At 320 px the document remained 320 px wide and the title lane measured 86 px instead of collapsing to a single-letter fragment.

The selected-model button in the composer also retained the shared Button's non-shrinking layout. The existing name span alone did not prevent it extending under neighboring actions. That one button can now shrink while retaining its natural desktop width. At 320 px its right edge was 176 px, before the settings control's left edge at 222 px. The model chooser remained available and exposed the full selected name; opening it with Enter and closing with Escape restored keyboard focus to the originating model button. No model choice was changed.

## Mobile sidebar close controls

The primary navigation's header row is 56 px tall, while the session drawer retains a 72 px heading. The shared close position had assumed the latter for both. The primary drawer also rendered a duplicate collapse control. Keep the Sheet primitive's single close button, align it to the actual header row, and use the shared 12 px horizontal gutter.

At 390 px, actual rendered centers matched at 28 px for primary navigation and 36 px for session history; both close buttons had a 12 px right gutter. The duplicate mobile collapse entry was absent. Open frames were separately inspected. Escape dismissed the drawers and the session drawer returned focus to its trigger. The implementation retains installed Sidebar, Sheet and Button primitives.

## Error code presentation

The user explicitly requested values such as 429 without an HTTP prefix. Shared request outcome labels now show Failed · 429. Code choices, filter chips, delivery summaries, request detail values and managed recovery diagnostics use the same compact formatting. Gateway and Provider distinctions and the underlying transport values remain intact.

Actual current 429 records were inspected in Logs, Overview and request details. The filter menu showed numeric options and the selected right-side check at desktop and 390 px. Choosing 429 produced its visible chip. A separate authenticated read of the actual filtered requests endpoint returned 200 and every returned record had a recorded transport status of 429. Details showed Provider 429 and delivery status 429; no new request was used to produce those records. Stored data and API status contracts were not changed. One existing fixture selector was aligned with the accepted label; its outcome supplies no evidence.

## Example colors and missing-key recovery

Inspected the actual public OpenRouter Chat task cards and Room settings state as the mature reference. Niu retains its own tokens and layout. Example prompts fill the composer rather than perform the primary send action, so they now use the installed ghost Button variant and the existing neutral task-card surface. The prior default variant had taken the primary brand fill.

Actual desktop and 320 px frames showed neutral examples with readable ink text. The measured resting background was approximately sRGB 0.988/0.987/0.986; hover remained neutral, and keyboard focus reached an example. The primary brand treatment remains on primary actions. No prompt was selected or sent for this color check.

An existing workspace independently had no active keys but did contain a revoked record. Provider materials had therefore missed its empty-key remedy, because it tested record count rather than active availability. The current candidate names No active API keys and exposes the existing Manage API keys and View models links. At 390 px the document measured 390 px, and each link reached the correct scoped destination. Discovery failures retain their separate retry state; a configured, populated native Provider module was not available and is not claimed as verified.

## Criteria and limits

User directions govern the status prefix and color emphasis. Niu's component, sidebar and menu conventions govern control composition and selection alignment. Applicable source-backed UX review criteria include status visibility, user control, consistency, recovery and restrained visual hierarchy from [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), and keyboard dismissal/focus behavior from the [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Pixel-center equality is a Niu layout criterion, not a universal accessibility rule. Actual current-input browser interactions, screenshots and independent backend artifacts provide evidence. Fixture results provide none.

These observations apply to the local candidate using the live staging backend. Hosted acceptance of this refinement batch is recorded after deployment.

## Hosted acceptance

Release `65e51e285666a4f0fdf0f9b3803e5460739e44fe` (PR #168) was composed by staging revision `b9330a6fe6eda7499716d0d665f73227b06e62e1`. Render deployment `dep-dbrvbsmi0phs73bm6720` became live at 05:56:57.940137 UTC on 2026-11-14. The independent readiness endpoint returned 200. The merge retains the separately published neutral shared-surface correction. Combined-source dashboard checks/build and public-boundary scan completed; non-fixture CI lint/type/build, documentation, generated artifact scanning and Rust lint/license checks were inspected separately. Fixture outcomes were disregarded.

Fresh hosted browser verification confirmed Chat and saved Video at a 464 px canvas inside a 1024 px browser, 36 px compact key controls and readable Default workspace names. Collapsing primary navigation gave Chat a 640 px canvas. On the original chat-1008 route at 390×640, real wheel input scrolled the transcript while body scroll remained zero and composer bottom stayed at viewport bottom. After transcript scrolling settled, scrolling the session list to 92.5 px left the transcript unchanged at 456.5 px. This separately verifies the two scroll regions. At 320 px Sessions was 36 px wide with its accessible name and title retained; its drawer opened and dismissed.

Actual primary and session drawer close centers were respectively 28 and 36 px, equal to their own header centers. Both right gutters measured 12 px relative to the drawer edge (not the browser edge); duplicate primary mobile collapse controls numbered zero. Open screenshots were visually inspected and Escape returned focus to the session trigger.

Actual hosted prompt examples had neutral backgrounds (approximately sRGB 0.984/0.984/0.983). Desktop and 320 px screenshots were separately inspected. The 320 px model selector ended at x176 before settings at x222; Enter opened its full chooser and Escape restored focus. The prompt remained empty. Current Logs and Overview displayed Failed · 429, numeric filter options and a right-side selected check. At 390 px the document remained 390 px wide. Independent filtered-request GET returned 200 with 21 current records, every recorded status 429. Request details displayed Provider 429 and delivery status 429, without the redundant prefix.

The existing no-active-key workspace rendered the explicit requirement and correctly scoped Manage API keys / View models links at 390 px. The key link was followed to its scoped destination. A populated native Provider context remains unavailable and is not covered by this missing-configuration acceptance. Final independent review-scope reads confirmed its key revoked, Chat draft payload prompt empty, USD limit and committed amounts both zero, and policy revision 5 with models deny_all. No model call was made.

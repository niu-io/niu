# API key filter identity — 2026-11-14

Finding: `niu-mm90.41`, related to `niu-mm90.2` and `niu-mm90.40`.

## Trigger and correction

The current Logs filter presented repeated API key names without the readable references already visible in the key list. A user could not identify which credential scope a same-name choice would filter. This is independent of key-directory transport recovery.

Reuse the key list's public-reference validation, append the readable reference to duplicate-name choices, and preserve that reference in the selected chip. Unique names remain concise. Keep existing backend identifiers and slug-based URLs unchanged, with no internal identifier fallback in visible labels. Bound the desktop key submenu to the existing 320 px menu scale while allowing its long list to scroll.

The UX review skill's source-backed [consistency and recognition criteria](https://www.nngroup.com/articles/ten-usability-heuristics/) apply: users should recognize a choice using the same reference across list and filter. Niu requires shared DropdownMenu radio semantics and selected checks on the right. The actual OpenRouter key settings reference redirected to authentication; private interaction equivalence is unverified. This correction uses the already-inspected Niu reference convention and existing menu primitives.

## Local current-data verification

Authenticated preview used the actual staging key directory and requests, with no key mutation or model invocation. The original directory produced repeated labels; the candidate's complete menu had no repeated labels and no GUID-shaped visible label. Selecting a real duplicate-name entry preserved its readable reference in both chip and URL. Independent authenticated reads confirmed the selected inactive key had no matching requests; the UI explained that state. Removing the filter restored the current populated request list.

Inspected settled desktop and 390 px menus, including right-side selected checks, scroll, Escape dismissal and focus return. Desktop submenu measured 320 px wide; at 390 px the document stayed 390 px wide. The key list retained its existing readable reference column after extracting the shared validation helper. The menu is a temporary choice surface; its bounded width and scroll preserve the request canvas rather than widening it with credential names.

Type checking, lint and production build completed. Fixture outcomes are not acceptance evidence. Hosted verification is still required before closing the finding.

## Adjacent Chat key action

`niu-mm90.43` was discovered while verifying the deployed Chat scroll repair. With no key selected, the default Button had a primary-colored background and its key SVG was forced to the identical primary color. At phone widths the text label collapses, leaving an apparently empty action. Independent computed styles confirmed the equality; this was a visible defect rather than an inference from CSS alone.

Remove only the SVG color override and inherit the installed Button foreground. Actual-data local 390 px screenshots show a light key icon on the dark unconfigured button and a dark icon on the light configured button. Computed SVG and Button foreground colors match in each state. The existing API key dialog opens, Escape closes it and the accessible action name remains specific. No credential or model request was created. This restores the shared Button treatment; no new interaction pattern is introduced. Hosted acceptance remains pending.

The final type/lint check completed. One concurrent-preview build could not resolve an existing SDK module; after stopping the task-owned preview, the isolated production build completed. Its generated artifact was inspected through the normal production build output; this is not a claim about fixture behavior or a substitute for hosted verification.

## Hosted acceptance

Core `41074c0713290c25d1a43138026afd9917c454d5` was live on staging at 01:02:40 UTC on 2026-11-14. At 390 px, the actual complete filter directory rendered 146 choices including All, zero repeated labels and no GUID-shaped labels. A selected duplicate-name key retained its public reference in both chip and URL. The independently fetched current requests endpoint returned HTTP 200 with zero records and summary request count zero, matching the explicit inactive-key empty state. Clearing the chip restored the actual populated request list. At desktop 1341 px, keyboard opening produced a settled 320 px submenu with opacity 1 and no running animations; right-side selection checks and wrapped readable labels were inspected. Two Escape presses returned focus to Filter requests. An earlier screenshot captured the submenu transition and is excluded from settled visual acceptance.

The Chat action was inspected at 390 × 700 in both states: the unconfigured/loading action had a light foreground distinct from its dark background; the settled selected-key action had a dark foreground distinct from its light background. Actual screenshots confirmed the key icon is visible. The selected saved conversation retained a 700 px main-panel extent and composer bottom 700 px. The existing dialog opened and dismissed without credential mutation. That separate keyboard check identified missing return focus after dismissal; `niu-mm90.44` records this connected issue and its subsequent candidate. The color acceptance does not claim the focus repair was deployed in this revision.

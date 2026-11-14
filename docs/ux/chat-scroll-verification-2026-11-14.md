# Chat viewport and independent scrolling — 2026-11-14

Finding: `niu-mm90.42`. This corrects the previously insufficient composer-reachability check; reaching the composer by scrolling the outer canvas did not establish independent pane scrolling.

## Observed cause and correction

On staging revision `4b1811eb`, the saved Chat route placed its composer below the viewport: textarea top 877.6 px in a 783 px viewport, with a 1073.6 px main-panel scroll extent. The Settings background-preservation boundary had introduced an extra block element between the workspace gate and Generations provider. This broke the existing direct-child containment selectors and left Chat sized by its content.

Use a keyed React Fragment for that boundary. Keep authority changes remounting the route, preserve the mounted Settings background, and restore the existing layout contract without adding page-specific overrides or changing saved data.

## Criteria and reference

The user's explicit requirement is a left session list and independently scrolling conversation and history, with an accessible composer. The UX review skill's Operate criteria require spatial stability and immediate state legibility; its visual-review method requires rendered evidence separate from functional checks. WCAG [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) supplies the narrow-layout criterion. These criteria do not themselves prove the repair. This repair restores the established Niu layout rather than introducing a new visual pattern; the earlier OpenRouter reference investigation did not expose authenticated Chat and is not evidence of private-page equivalence.

## Local current-data verification

The candidate used the actual saved staging conversation and history through an authenticated preview, with no model invocation.

- At 1440 × 600, the transcript had 394 px visible height and 722 px content. A real wheel gesture moved it from 0 to 250 px while history and outer canvas remained at 0. A subsequent history wheel moved history to 127.5 px while the transcript remained at 250. The composer bottom remained exactly 600 px.
- At 390 × 844, the document width was 390 px and composer bottom 844 px. A transcript wheel reached the beginning while the outer canvas remained at 0. At 390 × 600, the left history Sheet independently scrolled to 132.5 px while the underlying transcript and outer canvas remained at 0; the composer remained within the 600 px viewport. Escape dismissed the Sheet.
- At 1024 × 700 with compact primary navigation, document width was 1024 px and both main-panel extent and composer bottom were 700 px. Desktop primary navigation and the left history remained accessible. Inspected screenshots separately for hierarchy, grouping, action emphasis, clipping and spacing.
- Account Settings opened and dismissed using Escape without remounting the textarea. Transcript remained near its prior reading position; an 11.5 px adjustment was observed, so exact pixel preservation is not claimed.
- A saved Video sibling loaded its actual unresolved status without resubmission. Its main-panel extent remained 783 px in a 783 px viewport. Existing recovery guidance and prompt controls remained reachable.

Dashboard type checking, lint and production build completed. Fixture-test outcomes were not used. Desktop emulation does not establish real mobile software-keyboard behavior. Hosted acceptance remains to be recorded against the deployed candidate.

## Hosted acceptance

Core `2073027a8525f88f4c5df70c97d92d9bc304a2c5` was live on staging at 00:42:52 UTC on 2026-11-14. The original saved Chat route was reloaded and exercised with its actual saved turns and session directory.

At 1440 × 600, a transcript wheel moved the transcript to 250 px with history at 0. History then moved to 127.5 px while the transcript stayed at 250. Further wheels at the history boundary left transcript and outer canvas unchanged. The transcript subsequently reached its own 351.5 px boundary while history stayed at 127.5 and the outer canvas stayed at 0. Composer bottom remained 577.2 px, leaving the existing key-availability notice visible within the 600 px viewport. Early loading measurements before the composer mounted are excluded from the settled-state acceptance.

At 390 × 600, transcript gestures moved from 0 to 513.5 px, with outer canvas at 0 and composer bottom still 577.2. The history Sheet independently reached 132.5 px while the underlying transcript remained at 513.5; Escape closed the Sheet and returned focus to its Sessions trigger. At 1024 × 700, expanded primary navigation left a measured 464 px conversation lane; collapsed navigation left 640 px. Neither state caused document overflow or composer clipping. Keyboard Tab from the textarea reached Attach files. The Chat settings panel finished dismissing after its asynchronous draft flush; a screenshot taken during dismissal is excluded from visual evidence.

Viewport budget and visual judgment: at 1024 px expanded, the conversation occupies x560–1024, its header is 56 px, transcript about 485 px, composer 136 px and key notice about 23 px. At 390 × 600 the conversation spans the screen width, with roughly 385 px of scrolling transcript between the 56 px header and 136 px composer plus notice. These allocations retain readable saved content, reachable actions and a stable writing area. The left list remains visually separate without adding another navigation pattern. Settled full-frame desktop, phone and open-Sheet screenshots were inspected for grouping, density and all four edges. An invisible unconfigured key icon was separately identified as `niu-mm90.43`; this scroll acceptance does not claim that adjacent contrast issue is resolved.

The saved Video sibling also rendered within a 390 × 700 viewport without document-width overflow or resubmission. Logs retained its actual populated request list and ordinary management-page scrolling: a real wheel moved the main panel to 800 px. Thus restoring the Generations containment did not globally disable management-page scrolling.

Public build and documentation workflows were invoked. Any fixture commands within those workflows are recorded only as executed, and their outcomes are disregarded. Hosted current-input gestures and independently measured final DOM bounds supply the scroll acceptance evidence.

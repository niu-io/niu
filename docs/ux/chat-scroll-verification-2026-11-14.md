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

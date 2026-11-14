# Guardrails and workspace route verification — 2026-11-14

Findings: `niu-mm90.10`, `niu-mm90.45`, `niu-mm90.46`. Starting release revision: `09c9d568`. Current-input interactions use a dedicated review workspace with an independently verified USD spending limit and committed amount of zero. No model request, estimate, payment, invitation or existing workspace policy mutation was dispatched. Its policy and key audit history is retained under the existing storage contract.

## Policy creation and recovery

A workspace without a saved head had valid prefilled defaults but its save action was disabled because the draft equaled the initial defaults. Creation now permits those defaults and labels the action Create policy (Create at narrow widths); existing policies retain Save policy. Loading, permissions, invalid rules, blank names and conflicts still gate saving.

Actual UI creation saved version 1 with the default name and inherited model/Provider rules. An independent authenticated GET returned that head; reload restored it. Editing created version 2, followed by version 3 with Block all models. History → restore version 1 created version 4; restoring version 3 created version 5. Independent GET confirmed version 5, its saved name and deny_all model mode. This verifies persistence and recovery, not model enforcement, which was not invoked.

A newly created review key followed version 1, then version 2. Pinning version 1 displayed the current workspace version separately from the fixed assignment and retained that pin after the workspace advanced. Returning to follow displayed current version 5; pinning version 1 again retained its original saved name. The current workspace policy applies to every key; a fixed pin adds restrictions. It does not bypass the current policy. No copy or behavior was changed to suggest otherwise.

The initial request for per-section saves is rejected: the API saves one atomic immutable policy version, and key pins/history refer to the complete version. The existing sticky global save remained visible after scrolling the rules at both desktop (top 11.5–47.5 px) and 390 px (top 10–46 px). Keep one action with an explicit policy name instead of inventing partial-save semantics. The 390 px settled assignment menu used radio semantics, readable version names, a right-side selection check, and fit inside the viewport. Dialog/menu and policy/history screenshots were inspected separately for hierarchy, density, spacing and clipping.

## Workspace switching and drafts

Creating or selecting another workspace from a saved Chat previously retained the old workspace's resource path and generation query parameters. Scope changes now enter the target Generations index with only its workspace query, allowing the target's backend draft to restore. Reselecting the same workspace preserves the current task.

An actual unsent review draft was entered and independently read from the backend. Switching to Default restored saved Chat 1008; reselecting Default preserved that Chat. Switching back dropped the old Chat reference and restored the review draft. Reload restored the same unsent text. The review text was then cleared. No message was sent. This does not claim every legacy Video record retains its original input.

## Shared heading ownership

Following a named key's View policy link previously left the visible h1 as API key while Guardrails content and the document title had loaded correctly. Imperative title cleanup restored text into a shared React-owned node. ShellHeader now keys its title node by pathname and PageHeader resynchronizes on the pathname supplied by the key detail caller, so cleanup affects only the previous route's node.

The local candidate showed the actual key name on detail and Guardrails after the real View policy link, Policy/History/Blocked requests navigation, and refresh. At 390 px, History measured document width 390 px and showed readable responsive rows; the 1024 px collapsed-navigation view measured 1024 px with the correct heading and reachable toolbar.

## Criteria and evidence limits

Inspected OpenRouter's actual public [Guardrails documentation](https://openrouter.ai/docs/guides/features/guardrails): create policies, assign them, and retain account-level constraints alongside tighter per-key restrictions. Its private settings route required sign-in; no private layout equivalence is claimed. This work preserves the existing Niu layout and shared primitives.

Applicable criteria: the UX review skill's source-backed consistency, recognition, visibility of system status, recovery and responsive hierarchy guidance; [NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/); the [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/); Niu's durable backend data and shared UI constraints. Actual current-input browser interactions and independent final-artifact reads provide evidence. Fixture outcomes provide none.

Hosted candidate: public core `cb0e27903c61c0047e51886b3e4e0edc03b1edec`, cloud composition `de631d0d9bf7f5557322b7a81726f80c07b31f60`, Render deployment `dep-dbrt5k61egvs73c70eog`, live at 03:27:29 UTC. The actual hosted key detail displayed its original fixed version while the workspace remained version 5. Following View policy reached the correct Guardrails heading. At 390 px, History loaded the restored versions, measured document width 390 px, and retained that heading. Default's unconfigured policy exposed an enabled Create policy action with the narrow Create label; it was inspected without saving or changing that workspace. Hosted screenshots were reviewed. The review key remains temporarily active for the separately tracked Chat draft navigation correction (`niu-mm90.47`); zero spending limit and the current blocking policy remain in place until final cleanup.

The required workflow executed fixture commands. Their outcomes are disregarded and do not support any defect, acceptance or deployment claim. Policy fixture selectors were aligned with the accepted action wording as source maintenance; no product behavior was selected to satisfy fixture outcomes.

Follow-up on hosted core `4d13fcce`: the dedicated review key was revoked after the draft checks. Independent final reads confirmed the blocking version 5, zero spending limit/committed amount, empty review prompt and no recorded key use. Actual saved Chat and Video workspace switches reset the old resource path and restored the target draft; reselecting Default retained Chat 1008. The separate first-time workspace creation action has not been re-run after the routing correction, so that transition is not claimed as hosted accepted by this record.

Creation acceptance follow-up on hosted core `cef0588b`, composition `7d59ca5`: from an existing saved Video, the Create workspace dialog created an own empty review workspace without budget, keys or policy changes. The resulting URL was the scoped Generations index, its heading was New generation, its saved-session count was zero, and the old run reference was absent from the canvas. Cleanup used the exact-name Delete workspace dialog: the actual DELETE returned 204, an independent directory GET returned 200 with the temporary name absent and the original four entries, and settled navigation reached Default Overview. The momentary unavailable frame during deletion was superseded by the observed completed navigation. This completes the previously unverified creation branch of `niu-mm90.45`; no model request was dispatched.

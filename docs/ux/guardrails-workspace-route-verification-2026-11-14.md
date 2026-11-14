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

Following a named key's View policy link previously left the visible h1 as API key while Guardrails content and the document title had loaded correctly. Imperative title cleanup restored text into a shared React-owned node. ShellHeader now keys its title node by pathname and PageHeader resynchronizes on pathname changes, so cleanup affects only the previous route's node.

The local candidate showed the actual key name on detail and Guardrails after the real View policy link, Policy/History/Blocked requests navigation, and refresh. At 390 px, History measured document width 390 px and showed readable responsive rows; the 1024 px collapsed-navigation view measured 1024 px with the correct heading and reachable toolbar.

## Criteria and evidence limits

Inspected OpenRouter's actual public [Guardrails documentation](https://openrouter.ai/docs/guides/features/guardrails): create policies, assign them, and retain account-level constraints alongside tighter per-key restrictions. Its private settings route required sign-in; no private layout equivalence is claimed. This work preserves the existing Niu layout and shared primitives.

Applicable criteria: the UX review skill's source-backed consistency, recognition, visibility of system status, recovery and responsive hierarchy guidance; [NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/); the [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/); Niu's durable backend data and shared UI constraints. Actual current-input browser interactions and independent final-artifact reads provide evidence. Fixture outcomes provide none.

Hosted verification and review-key revocation are pending deployment of this candidate; the findings remain open until then.

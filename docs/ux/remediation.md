# Prerelease UX remediation evidence — 2026-10-21

This is a dated verification record. Current task state and ownership are tracked in Beads under `niu-lxs`; GitHub #100–109 remain the user-requested public issue references.

Status: implementation in progress. Parent: [#100](https://github.com/niu-io/niu/issues/100). The user authorized implementation of the review findings. No finding is closed until its user task and relevant regression/browser checks pass.

## Issue ownership

- [#101 — Global payment readiness](https://github.com/niu-io/niu/issues/101): UX-04.
- [Unify platform selling prices and independent customer onboarding](https://github.com/niu-io/niu/issues/102)
- [Connect account balance, funding and payment history in one billing task](https://github.com/niu-io/niu/issues/103)
- [Make model setup and launch eligibility reflect actual supply capabilities](https://github.com/niu-io/niu/issues/104)
- [Complete generation result lifecycle, readable references and output semantics](https://github.com/niu-io/niu/issues/105)
- [Expose complete Provider offers and modality-aware earnings evidence](https://github.com/niu-io/niu/issues/106)
- [Make policy edits and request-denial investigation scope explicit](https://github.com/niu-io/niu/issues/107)
- [Recover safely from uncertain API key creation and rotation](https://github.com/niu-io/niu/issues/108)
- [Reconcile dark-theme Provider assets and current user guidance](https://github.com/niu-io/niu/issues/109)

Mock payment service remains [#99](https://github.com/niu-io/niu/issues/99); reuse applicable verified work from [#98](https://github.com/niu-io/niu/issues/98). Deferred Provider discovery #97 is outside this repair scope.

## Commit discipline

Each implementation commit references its issue (`Refs #N` while acceptance is incomplete; `Fixes #N` only after the issue acceptance is satisfied). Preserve unrelated pre-existing changes. Review the staged diff and test evidence before committing. Do not close issues or claim product readiness merely because a patch exists.

## Verification ledger

Record each issue's actual changes, tests, browser states, compatibility and remaining integration boundaries here as implementation proceeds. The review's baseline is in [the complete evidence ledger](continuation-2026-10-21.md).


### Implementation checkpoint — account funding and shared causes

- #103: Settings has one Credits destination containing available funds, top-up orders and balance activity. Legacy Payments URLs remain usable aliases. Workspace Billing retains workspace spending/rates/limits and links authorized funders to Credits; members receive an account-owner handoff. Configured fiat units and historical currency semantics remain intact; branded currency is deferred to #110.
- #103 verification: 68 billing, funding and navigation tests passed; after fixing a browser-observed focus-return defect, all 31 funding tests passed. Actual local Credits and the open payment menu were inspected at 1280, 760 and 390 pixel widths. Escape restores focus to the opening funding action. A legacy `settings=payments` bookmark renders Credits. No merchant transaction was submitted. Reference: inspected OpenRouter Credits and its History handoff. Criterion: task ownership, recognition and keyboard recovery; combining the funding journey removes the competing Settings destinations.
- #101: server prerequisite and frontend fail-closed readiness state implemented. Gateway build/check and three frontend readiness tests passed; isolated PostgreSQL and broader integration verification are pending. Local service was reloaded with existing configuration. No payment configuration or customer records changed.
- #107: unsaved policy sections are named, saving explicitly applies all changed sections, and users can discard the whole draft. Twelve focused tests passed; cross-section rendered verification remains pending.
- #105: ordered-list markers restored. Model finish reasons are being captured and retained so output-limit/filter/tool-action/unknown outcomes are not labelled Complete. Generation regression and rendered checks remain pending.
- #104: removed unsupported Popular ranking based on the first eight models; model choice defaults to All models. Rendered verification remains pending.
- #109: monochrome OpenRouter/AWS marks receive dark-theme inversion without affecting color/custom marks. Customer payment guidance now points to Credits. Rendered asset and served-document verification remains pending.

These are implementation checkpoints, not issue closure or a product-readiness claim. Remaining findings retain their acceptance gates in the linked issues.

### Follow-up verification and additional corrections

- #101: isolated rendered administrator and viewer states show role-appropriate payment remedies; blocked workspace menus omit creation. Readiness recovery restores the workspace page without changing its role permissions. Backend PostgreSQL verification is still building; do not treat the fixture as backend proof.
- #105: saved synthetic stop/length/content-filter/tool-call outcomes and nested ordered lists were inspected at desktop, split-pane and mobile widths. Outcome guidance aligns with response content. The gateway save/export sanitizer now retains a bounded completion reason; old records without it are labelled as an unknown ending. Failed responses keep partial text, and terminal empty output is not shown as still waiting. The first focused generation run passed 61/62 tests; its remaining test waited for a removed empty-state label and was corrected. Later regression coverage passed all 62 generation tests before the final partial-output adjustment, which still needs rerunning.
- #106: offer continuation, scoped abort/retry, and explicit loaded counts implemented. Periodic overview refresh no longer resets a reader's expanded offer list. Media-only earnings use the recorded payout rate and do not show the text-only empty state. Provider members can inspect their agreed media rate history without publish/replace/end actions. Browser and final regression verification are in progress.
- Integration checks exposed lazy-route timing assumptions and an obsolete assertion requiring the health request to precede other independent requests. Tests now assert the health request itself and permit lazy imports to complete; the rerun is pending. No failed suite is recorded as passing.

- #106 rendered fixture checks: Provider viewer can open agreed media payout details without mutation actions or internal identifiers; media-only usage displays its recorded payout and earnings. Final mobile layout/focus and large-list continuation checks remain pending. The Provider business and media-rate-history suites passed before the latest focus/spacing refinements.
- #107 follow-up: unsaved scope notice also accompanies History and Blocked requests; restore is unavailable until the draft is saved/discarded. Restoring a version refreshes the parent editor's policy head. Pending-section links now work from the Guardrails root as well as its subsection routes. These additional changes require regression and browser checks.
- Latest broad layout run remains failing (11 of 52), with timing-sensitive lazy-loading/login checks among the failures. Diagnose each result rather than treating resource contention as proof that the product passes. Isolated PostgreSQL compilation is still in progress. No issue has been closed and no implementation commit has been created yet.

### Verified continuation — Provider inventory and navigation

- The isolated layout rerun passed all 52 tests, including payment prerequisite/recovery, session permissions, scoped navigation, legacy bookmarks and delayed responses. Earlier failed runs remain above as diagnostic history; this run is the current result.
- #106: browser continuation loaded offer 1,001 from a 1,000-row preview; the count became 1,001 and the continuation action disappeared at the end. Provider viewer media rate details passed desktop and stable 390px inspection; Escape returned focus to the initiating View rate button. No rate publication or live financial mutation was performed.
- #106: missing or malformed media collections produce an unavailable message rather than a false no-consumption state. The latest focused Provider business suite passed 15 tests. Shared Provider/media/policy suites passed 39 tests before this additional availability guard. Source authorization for media history remains `platform_or_member`, scoped by Provider; customer access denial and member-role behavior are covered by the Provider suite.
- PostgreSQL verification completed its initial dependency build and is now rebuilding the changed gateway test target before execution; no database acceptance is claimed yet.

### Verified continuation — readiness and platform defaults

- #101: the isolated PostgreSQL readiness test passed. It covers missing platform currency, absent/invalid gateway configuration, authentication before refusal, and recovery after valid configuration without customer mutations. This replaces the earlier pending database status; it does not prove a live merchant transaction.
- #105: the latest generation suite passed all 62 tests after retaining failed partial output and correcting the follow-up assertion to account for the retained response container. The Provider/other generation batch passed 85/86 before that assertion correction. A final partial-output visibility assertion was added and is pending rerun.
- #106: the mixed text/media case now joins media-only, missing/empty data and offer continuation coverage. The focused Provider suite passed all 16 tests in the shared run.
- #102: absent compatibility enrollment now inherits a published platform text/media price in the configured currency. Discovery, configuration preview and admission use the same selection. Media requires exact dimensions and meter. Explicit legacy selections and admitted operation prices remain intact; ineffective legacy text writes are rejected while a platform price applies. Two isolated default-pricing tests and all 14 existing billing tests passed. No live prices, balances or customer records were changed.
- #102 remains open: the legacy workspace pricing UI, independent customer handoff and media specification choices still require remediation. Passing storage tests does not establish completion of that journey. Backend changes depend on the existing uncommitted platform-currency implementation and must be committed in dependency order, without bundling unrelated work.
- Criteria: the skill's [structure and language review](https://www.nngroup.com/articles/ten-usability-heuristics/) applies match-to-user-task, consistency and recognition. Platform ownership/default behavior is the confirmed Niu product decision, not a universal requirement of that source. The default-pricing API removes a setup dependency; rendered discoverability remains unverified.
- Browser inspection transport became unavailable during this continuation. Earlier fixture evidence remains valid for the states recorded above; no new visual acceptance is claimed. Continue non-browser work and retry browser verification before delivery.

- #105 final focused verification: all three failed-stream cases passed with explicit partial-text/terminal-state assertions. The gateway completion-reason sanitizer/export unit test passed. Dashboard TypeScript check passed.
- #102/#109 guidance: the customer quickstart now starts with existing workspace access, model choice, credits and a scoped key; installation-only work is a separate section. The docs build generated 811 pages successfully. Commit `3e4c1ed4` references both issues and contains only this guide. Rendered/served guide verification remains pending.
- #108 diagnosis: both current workspace create and rotate handlers commit the credential before fetching response detail. The browser currently permits a fresh mutation after transport failure. Create needs durable operation correlation/reconciliation; rotation already records an atomic replacement audit event but has no customer recovery contract. Do not solve this with blind retry or by retaining retrievable key secrets. Navigation/re-entry and role-loss recovery remain part of acceptance.

### Verified continuation — key mutation recovery foundation

- #108 storage: `e2a15269` adds an atomic, workspace-scoped request identity for key creation/rotation. Identical retries resolve to the same key, changed intent conflicts, and replay never returns the secret. The database retains only an intent digest and result reference. Existing non-idempotent entry points remain compatible. Three isolated PostgreSQL tests passed, including concurrent retry, restart/reconciliation, revoked credentials and rotation response loss.
- #108 HTTP/SDK (not yet committed): create/rotate accept `Idempotency-Key`; replay returns 200 with `secret_available: false`, and a write-authorized status read exposes only committed metadata. Gateway check passed. An isolated full-router test passed creation/rotation response loss, secret omission, viewer denial and subsequent operator revocation. The first test compile failed on private payment fixture types; a test-only configuration helper fixed that without widening production visibility.
- SDK administration regression passed 91 tests. Annotated contract extraction and root-entrypoint verification passed. Generated documentation now contains 399 REST operations and 381 exported SDK symbols; four documentation tests passed. Readiness and key request recovery are included in the root contract and appropriate navigation groups.
- #108 is not resolved: the dashboard still uses the legacy mutation path. Pending-intent persistence, reconciliation on navigation/re-entry, explicit lost-secret recovery and rendered interactions remain to implement and verify. See [the recovery contract](../reference/key-mutation-recovery.md). Browser transport is still unavailable; this continuation made backend/contract progress and does not claim visual acceptance.

### Rendered key recovery evidence — isolated browser fallback

- `niu-lxs.28` / #108: the dashboard now submits durable request identities and retains a secret-free, actor/workspace-scoped recovery hint. Re-entry exposes the unresolved request; confirmed validation failures remain correctable. Existing result state is read from the server, and revocation is explicit before another credential is requested.
- Twenty-nine client and integration tests passed, including pre/post-commit response loss, same-identity retry, navigation/re-entry, committed rotation, explicit revocation, late-response suppression after role loss and visible confirmed rejection. TypeScript passed.
- The native browser connection remained unavailable. A separate temporary Chrome profile rendered the synthetic fixture against current Vite source; no existing browser profile, actual credential or live mutation was used. The stopped dashboard asset server was restarted on its established port.
- Final dialog inspections: 1280px desktop with navigation expanded (512px dialog); 760px split-pane (512px dialog); 390px mobile with navigation closed (358px dialog, 16px side gutters). An initial resize-animation frame was not treated as stable layout evidence. A separate invalid overlay combination was discarded and the unobscured mobile action rechecked.
- Visual inspection found duplicate vertical spacing from grid gap plus spacing utilities; removing the duplicate restored the existing dialog rhythm. Check saved result is the primary uncertain-outcome action. Confirmed outcome exposes explicit revoke/finish recovery instead of another retry.
- Native Tab input retained focus within the mobile dialog; Escape closed it and returned focus to Review request. The saved-result fixture displayed no secret or internal reference. These observations support visibility/error-recovery and keyboard criteria; they are not a complete accessibility claim.
- Full browser-to-disposable-gateway verification and final mature-reference comparison remain outside this checkpoint. The task remains open in Beads. Local tracker updates were saved and the portable snapshot refreshed; no remote task publication was performed.

### 2026-10-21: integrated key recovery and pricing/capability handoffs

- #108: browser-to-disposable-gateway acceptance passed for creation and rotation. A fault proxy discarded each successful response after commit; reload retained the creation request; reconciliation found the committed key; explicit revocation cleared the recovery reminder. Database assertions confirmed one creation and one replacement, all revoked. The complete HTTP regression passed. No live credentials or upstream requests were used.
- #102: removed the ordinary Workspace prices tab and enrollment guidance from platform pricing. Existing records, admitted prices and compatibility APIs remain unchanged. The platform list was rendered at 1280, 760 and 390 CSS pixels; the model menu was inspected open and Escape returned focus. The intermediate media dialog originally touched both edges; correcting its width produced x=16, width=728 at viewport 760. The public OpenRouter model listing was inspected as a reference for model-oriented prices and explicit units; it is not an operator price-publication interface. Customer handoff acceptance remains separate.
- #104 / UX-16: missing capability metadata no longer produces a Chat launch or Chat completion example. Text/video output metadata produces the corresponding actions, including both actions for dual output. Unknown legacy routes remain manually selectable with an explicit unverified-support notice, but are excluded from automatic Chat selection. The detail page was inspected at 1280/390 and the model picker at 760/390; keyboard Escape returned to Choose models. No model request was sent. The final 92-test model/generation run passed; an earlier fixture without declared text output was updated to reflect the new requirement. The neutral notice styling was subsequently inspected in the browser.
- Criteria: NN/g feedback, match to the user's task and error prevention support distinguishing unknown outcomes/capabilities from confirmed success or support. WAI-ARIA dialog guidance supports focus return. Platform ownership is a confirmed Niu decision; preserved compatibility is an explicit migration constraint. These checks do not establish current upstream availability or close the broader supply-readiness findings.

### 2026-10-21: external-check preview evidence

- #107 / UX-21: saved workspace policy history and key assignment now share an inspectable external-check preview. Matching configuration fingerprints resolve recipient and processing conditions; changed configuration displays current recipient explicitly as current, without implying historical provenance. Missing details, disabled checks and lookup failure have separate states. Existing policy and consent validation remains unchanged.
- TypeScript and 23 focused preview/history/key tests passed. Saved history rendered at 760 and 390 CSS pixels. At 390, dialog bounds were x=16,width=358,height=812, with vertical scrolling and wrapped processing terms. No restore, assignment or external check execution was performed. Assignment browser and actual mutation acceptance remain outstanding.
- Criterion: NN/g recognition, system status and error prevention require reviewable consequences before selecting a saved policy. Configuration-fingerprint matching is product evidence, not proof of a live external service or independently verified processing guarantees. Historical records without retained processing descriptions cannot reconstruct removed or changed recipient terms.

### 2026-10-21: recorded-block investigation handoff

- #107 / UX-26: recorded workspace and key policy versions link directly to saved history within the same workspace. Requested revisions load independently of the visible history page. The preview explains the administrator remedy and links back to blocked requests; missing policy references are explicit, and the page distinguishes pre-dispatch evidence from output-block Logs.
- Browser fixture verified the narrow-screen transition from a recorded external-check failure into version 1 and back to the same workspace block list. The saved check preview remained available. A regression test exercises an older version outside the loaded page and verifies a reader receives no restore control. No rejected request content was exposed and no policy was restored.

### 2026-10-21: policy evidence acceptance follow-up

- Frontend policy-evidence work is committed as `645f7318` (Refs #107). Exact-revision history rejects mismatched response versions, clears origin parameters on dismissal, and restores keyboard focus even when opened by a deep link rather than a history-row button.
- Browser checks covered read-only desktop history (no Restore control), a missing saved version at 760 CSS pixels, key assignment preview at 760, and the open saved-policy menu at 390. Menu/dialog dismissal returned focus to Change key policy. A changed detector fingerprint displayed the current recipient separately and omitted unrecoverable historical conditions.
- Thirty-three policy tests and TypeScript passed; ten key-policy tests passed after exact-version linking and response validation. The first PostgreSQL role/scope run failed because its legacy fixture lacked the new global payment prerequisite (503 rather than the expected authorization result). The fixture now configures platform currency and a test gateway; its rerun is still in progress. This is not yet backend acceptance evidence.

### 2026-10-21: Media price preparation (UX-24; #102; niu-lxs.25)

The standard-price model metadata now projects validated video output specifications into model, resolution, reference-video support and billing-unit choices. Invalid or stale schemas yield no media choices; raw schemas and upstream model identities are omitted. This metadata establishes configuration only, not qualified supply or authorization. The media editor derives matching codes from those choices, preserves exact decimal arithmetic, defaults quantity to one and places precision/rounding under advanced settings. A calculated example includes the minimum floor and selected rounding; display uses compact currency formatting. Missing configuration links to Providers, whereas read failures remain errors.

Evidence: nine dashboard tests cover configured submission, exact retry identity, missing/error states and exact minimum/rounding examples. Three isolated PostgreSQL storage tests pass, covering metadata validation, platform text/media defaults, exact dimension matching and pinned historical behavior. Rendered fixtures at 1280, 760 and 390 CSS pixels show open model/resolution/rounding menus without horizontal overflow; the 390px dialog measured 341px client and scroll width. Escape closes the rounding menu and restores its trigger focus. These are synthetic browser reads, not a real end-to-end publication. Acceptance still requires the complete publication/readback journey against the current gateway.

Criteria: ux-review interface design (recognizable choices, progressive disclosure and recovery), source-backed NN/g recognition rather than recall/error prevention, and WAI dialog/menu keyboard behavior. Mature-product reference inspection from this review covered OpenRouter public model metadata; no authenticated OpenRouter pricing-administration flow was available, and no equivalence to one is claimed.

The subsequent real-router PostgreSQL regression `retail_media_price_choices_publish_and_read_back_exactly` passed: it reads configured media choices, publishes a schedule derived from them, repeats the same idempotent submission and reads back the exact saved decimal/rational schedule at version one. Together with the browser interaction checks and nine dashboard tests, this verifies the UX-24 preparation/save path without an upstream paid request. It is not a browser-to-real-gateway end-to-end run. The API reference and JavaScript SDK metadata types were updated; generated REST/SDK references pass drift checks. The final TypeScript check passed. Public-boundary scanning passed for the seven scoped implementation/evidence files.

### 2026-10-21: Exact key-capacity investigation (UX-10; #107; niu-lxs.11)

The key Limits summary now opens a scoped contributor list instead of requiring a manual search through recent requests. The read uses the same rotation lineage and membership predicates as concurrent-request accounting and the token budget: unresolved dispatches remain included; completed unknown usage is bounded by the 60-second window; known usage and confirmed nonexecution are excluded from the reservation list. The endpoint uses a bounded read-only snapshot, cursor validation and a maximum page size of 100. It returns public model/key names, timestamps and capacity evidence, without credentials, prompts or procurement data. This is diagnostic only and does not release or replay requests.

Selecting a model opens that exact request in the existing request-details sheet, including records associated with an earlier secret. Browser evidence confirmed this works even when the recent-list endpoint fails. The browser URL retains the readable key path; the internal attempt identifier is neither displayed nor appended to it. Escape returns focus to the capacity trigger. A new Help guide explains the distinction between unconfirmed completion, missing usage and eligible evidence-based reconciliation, with links to the existing administrator procedure.

Verification: the initial PostgreSQL membership test passed for rotation, window expiry, resolved versus uncertain states, exact pagination and tenant isolation. A rerun after adding bounded read transactions is pending. Dashboard regressions passed 73 tests; the subsequent request-handoff regression run passed 63 overlapping tests; final capacity/limit coverage passed 10 tests. TypeScript, gateway check, dashboard build and the 817-page documentation build passed. Generated references and the root entrypoint check include the new API. The served Help iframe loaded the new guide. Initial 390px inspection found hidden table columns; the corrected two-column layout measured a 341px dialog and 293px table with equal client/scroll widths. Desktop and 760px views show all four columns. The scoped API authorization test remains running after correcting two test expectations to the existing management contract (inference keys receive 401; foreign workspace scopes return non-enumerating 404). Production authorization was not weakened.

Criteria: the ux-review visual review's source-backed NN/g meaningful feedback and recovery rules require a status to lead to its actual contributing records; the WAI-ARIA dialog pattern requires focus recovery. Concrete evidence above covers those properties, not general accessibility conformance or a new upstream execution/reconciliation qualification. UI composition reuses the existing key policy-history dialog and request-details sheet; no authenticated OpenRouter key-limit view was inspected for this change.

The final UX-10 PostgreSQL reruns passed: the real-router authorization test verifies member-read access, inference-key rejection, foreign-scope non-disclosure, absent keys and invalid queries/cursors; the storage test verifies rotation-lineage membership, completion/window distinctions, pagination and scope after adding bounded snapshot reads. The complete diagnostic path is verified with controlled records and rendered exact-record handoff. This does not claim new live Provider reconciliation or actual-user research. The served troubleshooting guide was also opened successfully in the product Help iframe.

### 2026-10-21: Customer owner sign-in recovery foundation (UX-03; #102; niu-lxs.4)

Source inspection found a concrete provisioning recovery gap: the password reset API required a saved credential revision but exposed no authorized read of that revision. Added non-secret password configuration reads under the existing member-management boundary, with missing/revoked users returning 404 and all responses non-cacheable. This does not broaden platform-admin tenant access or enable disabled authentication. SDK reads and explicit resets preserve the expected revision and never retry writes automatically; company-creation guidance now explains the owner/workspace boundary, configured platform currency, uncertain creation and password reset recovery.

The real PostgreSQL/router test passed for unconfigured/configured state, normalized email and revision readback, missing identity, unauthenticated/viewer/foreign-owner rejection, reads while password authentication is disabled, stale-reset conflict, sign-in and durable revocation of old sessions. The focused SDK test passed, TypeScript compiled, generated references verified (401 REST operations and 383 SDK exports), and the documentation build completed with 820 pages. These are API recovery checks, not completion of the console provisioning journey; UX-03 remains open.

The actual OpenRouter workspace list and open creation dialog were inspected again without saving changes: list-level creation, a named dialog, Name followed by Slug, supporting URL guidance, optional fields and clearly separated Cancel/Create actions. This provides a reference for workspace form structure, not evidence that OpenRouter has a comparable installation-level customer-provisioning console. The [Stripe customer guide](https://docs.stripe.com/invoicing/customer) supports the separate customer-directory/create/detail task pattern; its authenticated Dashboard has not been inspected. Under the skill's NN/g recognition and recovery criteria, a persisted company and user must remain discoverable after an uncertain response; a token or a successful create alone is insufficient evidence of customer readiness.

### 2026-10-21: Complete user inventory for customer handoff (UX-03; #102; niu-lxs.4)

The existing user directory returned at most 1,000 identities with no continuation, making uncertain owner creation unsafe to reconcile. Added company-filtered, scope-first keyset pagination to the existing endpoint and a typed SDK page method. The Users page now follows continuation for its inventory and role readbacks, rejects repeated cursors and foreign-company responses, and fails explicitly if a later page cannot be read. Matching display names remain separate identities. This is a dependency of customer provisioning, not proof that the whole provisioning journey is ready.

An isolated PostgreSQL test traversed 1,004 records, including identical names and a workspace-scoped owner, and verified non-overlap plus missing/out-of-scope cursor rejection. Fourteen frontend tests and two SDK tests passed; TypeScript and the dashboard production build passed. Browser checks of the actual Users route with controlled read-only records covered 1280px, 760px (navigation closed and open) and 390px. The narrow layout had equal client/scroll widths of 390px; its user actions menu opened by Enter, stayed in the viewport, and Escape restored focus to the original trigger. No user access was created or revoked in the browser. These checks support the skill's recognition, complete state and keyboard-recovery criteria; the real-router pagination authorization test is tracked separately in Beads until its run finishes.

### 2026-10-22: Customer console and identity retry verification (UX-03; #102; niu-lxs.4)

Added a separate Customers directory and resumable company/workspace/owner setup under installation administration. The flow preserves company funding boundaries and platform currency, generates editable workspace slugs, reads saved password configuration and discloses resets only on request. Creation does not imply funding or model readiness. The disabled-authentication remedy links to the deployment guide's actual member-sign-in section.

Identity-only user creation now records a durable company-scoped receipt atomically with the identity, without issuing a session. Two PostgreSQL storage tests passed for concurrent replay, changed input, revocation, preserved changed roles and rollback on receipt failure. The real-router test passed for scope enforcement, missing/invalid request modes and credential-free replay. The earlier user-directory router test also passed. SDK transport testing caught an allowlist omission that mocked component tests could not detect; the request layer now permits identity-only creation retries, and all three focused SDK tests pass.

The customer component tests pass for uncertain owner creation across remount, workspace pinyin/manual slug preservation and password reset recovery. TypeScript passes. Rendered read-only fixture inspection found that Escape discarded focus; explicit dialog focus restoration now returns to the originating Set up button, verified in the browser. These checks apply NN/g error recovery and the WAI dialog focus-return requirement from ux-review. Responsive and complete new-owner sign-in/funding/model handoff verification remain outstanding; this is not completion of UX-03 or product readiness.

The subsequent responsive review covered 390px and 760px setup dialogs, the 760px navigation drawer, and the 1024px desktop sidebar. The 390px setup dialog measured 356px client/scroll width; the 760px dialog measured 670px. At 1024px with navigation expanded, the content region measured 658px without horizontal overflow. A long unbroken company name initially pushed the row action out of view; fixed table layout, a reserved action column and anywhere wrapping now preserve the full name and visible Set up action (358px table client/scroll width at 390px). The owner menu now aligns with its trigger, retains the installed radio gutter, supports keyboard selection, and Escape returns focus first to the menu trigger and then to the row action. Configured sign-in displays its saved email with an explicit Reset password action. Chinese workspace names generate pinyin and subsequent name edits preserve a manually entered slug. No credentials or creation mutations were submitted in these browser fixtures.

Three customer component tests and TypeScript passed after these corrections. The new real-router provisioning-to-login regression initially failed at the intended global payment prerequisite: its isolated installation had neither configured currency nor a payment gateway. The rerun supplies the existing inert gateway configuration fixture; it must pass before the handoff is considered verified. This is configuration testing without merchant requests, customer funding or upstream inference.

The final `customer_console_provisioning_handoff_preserves_company_isolation` real-router/PostgreSQL test passed with the payment prerequisite configured. It creates a new company and workspace, creates/replays the identity-only owner, configures password sign-in, authenticates that owner, verifies company-wide owner scope and the sole visible company/workspace, rejects foreign user-directory access, and denies creation of another company. It does not send payment or inference requests. The console now gives a direct currency/payment-configuration remedy for the structured prerequisite error, rather than only reloading an unrecoverable setup read. Rendered desktop inspection confirms the remedy and absence of misleading empty creation forms; a dedicated component regression covers this branch.

### 2026-10-22: Explicit customer and operator guidance (UX-03 / UX-25; #102 / #109; niu-lxs.4 / niu-lxs.26)

The published Administration navigation now includes Customer setup. Its guide starts with installation authority, currency/payment prerequisites, qualified supply and selling prices; then follows the actual Customers dialog through independent company/workspace creation, owner sign-in and secure handoff. It links to the customer Getting started guide for Credits, model access, workspace keys and request inspection. The administration overview and quickstart now name the real Customers entry instead of leaving provisioning as an unexplained instruction. Updated overview destination labels match Pricing and Branding in the sidebar.

The dashboard build passed and the documentation build generated 821 pages. Browser inspection of the built static artifact verified the new navigation entry, operator-to-customer guide link and 1280px/390px reading layouts, including the opened mobile navigation. The existing Starlight composition and Niu theme were retained. Criteria: ux-review's structure-and-language role/knowledge boundary, NN/g recognition rather than recall, and visual-review responsive readability. This proves guide rendering and separation of responsibilities, not a funded first inference request or the authenticated Help iframe deployment. Those broader handoff checks remain separate acceptance evidence.

### 2026-10-22: Funded first request and slug rejection recovery (UX-03; #102; niu-lxs.4)

The customer handoff real-router/PostgreSQL regression now continues through owner-authorized workspace API-key creation, discovery of its granted model, rejection of an unfunded request before upstream dispatch, trusted test settlement, a successful Chat response from a local Provider fixture, and one customer charge in the saved ledger. It passed. This extends the earlier company/sign-in/isolation checks without contacting a merchant or a paid upstream service. Trusted settlement is an explicit test boundary; it does not qualify checkout, payment notification processing or production supply.

A recovery audit found that a definitively occupied workspace slug was incorrectly treated as an uncertain write, locking the form into replay. The console now distinguishes the structured `workspace_slug_taken` rejection from generic conflicts and unknown outcomes. It clears only that rejected request, allows editing, focuses the slug field, and removes the obsolete collision message when the slug changes. Unknown outcomes retain their original request identity. A failure-only browser fixture verified the actual 409 response, field unlocking and focus return without creating any workspace. Five customer component regressions cover collision correction alongside uncertain creation, password recovery and prerequisite routing.

Criteria: ux-review error prevention/recovery and WAI focus guidance require a known input error to provide an actionable correction, while preserving uncertainty after unconfirmed writes. Browser inspection caught the additional focus loss after disabling the submit button; the corrected form returns focus to the relevant field.

### 2026-10-22: Provisioning acceptance boundary (niu-lxs.4 / niu-lxs.26)

The final dashboard build passed after slug recovery changes. The new customer guide also loaded inside the product Help iframe; following Getting started updated the parent route to `/help/getting-started/` and preserved the embedded reading surface. This used the actual dashboard and built documentation with an isolated local API fixture, not a deployed production instance.

UX-03's scoped acceptance is satisfied by the discoverable Customers task, resumable company/workspace/owner setup, explicit authentication and payment remedies, documented secure owner handoff, and the real-router provisioning/sign-in/isolation/first-request regression. The browser checks cover desktop, intermediate and narrow layouts, long content, open choice menus, keyboard return focus and rejection recovery. Merchant checkout qualification is not evidence required to prove independent customer provisioning; the Credits/payment journey remains separately tracked in niu-lxs.23 and the payment prerequisite in niu-lxs.5. No production merchant readiness or paid upstream qualification is claimed.

### 2026-10-22: Credits order readability and payment lifecycle (UX-22; #103; niu-lxs.23)

A customer-owner fixture with pending, paid, closed and reconciliation-required orders exposed a narrow-screen defect missed by the earlier empty-history checks: the payment table clipped statuses and pushed row actions offscreen. The table now groups date beneath amount on narrow screens and keeps each status beside its action in a second visible column. At 390px the rendered table measures 308px client/scroll width. Desktop retains a separate date column. Opening a checking-payment order and returning with Escape restores its exact row action.

Order details now explain what each status means and direct users to check the existing payment before creating another top-up. Paid status describes recorded shared-account credits; closed/uncertain states do not imply safe replay. The 31 focused funding regressions pass. The existing real-router/PostgreSQL `stripe_checkout_creation_replay_and_lifecycle_are_durable` regression also passes against local simulated provider responses, covering saved checkout replay and paid/pending/expired lifecycle handling. This is not a live merchant test or actual-user usability study.

Criteria: ux-review's source-backed Carbon table/readability and NN/g visibility/recovery principles require important statuses and available actions to remain visible at the supported width. The correction preserves the installed Table and Button primitives and shared Credits composition; it does not create a separate mobile card system. Remaining journey checks stay in Beads.

### 2026-10-22: Credits return path and permission handoff (UX-22; #103; niu-lxs.23)

The owner path from workspace Billing preserves the selected Statements tab while opening Settings → Credits. Closing the funding form returns to Add credits; closing Settings now restores the actual Manage credits opener rather than always focusing the account menu. The fallback still handles account-menu items that unmount. A regression covers the explicit opener. Viewer sessions receive a company-owner handoff and cannot access shared credits through a direct settings query. Customer language now says company owner rather than organization owner.

The combined account-settings/billing suite passed 84 tests, TypeScript and the dashboard build passed, and the real-router/PostgreSQL shared-balance access/trusted-funding regression passed. At 760px the payment table measures 646px client and scroll width with visible statuses/actions; this supplements the earlier desktop and 390px inspection. The payment-method menu opens and Escape restores its trigger. These checks satisfy observable route, focus, scope and recovery behavior under NN/g status/recovery and WAI dialog guidance. Actual-user goal-prompt research has not been performed; the bead retains that explicit evidence limit.

### 2026-10-22: Central-currency guidance reconciled (UX-12; #109; niu-lxs.13)

The Customer pricing and Payments guides now use the actual Account balances destination. New accounts inherit Admin → Settings currency; the help no longer asks users to choose an absent per-account currency control. Historical currencies remain unchanged, with no implied conversion. The related credit validation message now distinguishes missing platform configuration from an invalid amount instead of asking the administrator to enter a currency.

The rebuilt 821-page documentation artifact was loaded through product Help and its corrected account-administration paragraph and Payments destination were verified. The actual Set approved credit form shows USD as text, no currency choice, and an invalid negative amount produces amount-specific guidance without sending a mutation. Desktop and 390px dialog rendering were inspected; the narrow dialog measures 356px client/scroll width. Cancel no longer triggers an unnecessary account reload that disables its opener; Escape returns to Set credit. Successful saves still reload, and uncertain outcomes explicitly require refreshing before another change. Criteria: NN/g consistency, recognition and recovery; WAI return focus. These are local served-artifact and isolated API-fixture checks, not production deployment evidence.

### 2026-10-22: Role-specific first-request acceptance (UX-25; #102 / #109; niu-lxs.26)

A company-owner session without platform administration can open Models in its selected workspace and the API keys → New API key form with model access and expiration controls. The rendered labels match the customer quickstart. Credits and insufficient-permission handoffs were verified separately in the same customer scope. Final reconciliation changed the outdated Usage label to Activity and the API tutorial's Keys label to API keys; empty model discovery now points to the workspace owner or installation administrator instead of requiring customers to inspect internal routes. The customer guide does not require Provider credentials. The operator guide separately covers currency, payments, supply, selling prices and independent customer provisioning.

The rebuilt 821-page artifact was verified through Help, including role-specific prerequisite text and Activity naming. Related niu-lxs.4's real-router regression establishes owner sign-in, scoped key creation, model discovery and an isolated funded first request. Browser checks do not issue credentials or send inference requests. Together these satisfy the role/handoff scope, using ux-review's NN/g recognition and structure/knowledge-boundary criteria; they do not qualify production merchant or upstream service readiness.

### 2026-10-22: Cross-section policy save scope (UX-19; #107; niu-lxs.20)

Revalidation found that whole-policy Save all changes and linked changed-section summaries were present, but invalid hidden input only disabled saves without explaining the cause on other sections. The shared pending-change notice now lists each invalid section, its exact validation message and a review link. It remains visible at external-check, input, output, policy, history and denial destinations. The existing discard path restores the saved draft; conflict handling blocks further saves until reload.

Browser verification edited the policy name, traversed Policy into External checks, confirmed the disabled save explained the hidden invalid name, followed the review link back, discarded, and reloaded to confirm the saved name and disabled save. Desktop, 1024px navigation-open/closed and 390px were inspected; the narrow notice measures 356px client/scroll width. No policy write was submitted in the browser. Focused component coverage verifies a single atomic expected-revision submission for changes from two sections, preserved hidden data, invalid hidden input, discard, and conflict/reload without automatic replay. The six-file Guardrails suite passed 53 tests; final expanded editor regressions passed 14 tests, TypeScript and dashboard build passed. Criteria: NN/g visible state, recognition and error prevention at the actual commit point. Production policy enforcement is outside this save-scope finding.

### 2026-10-22: Media consumption completeness revalidation (UX-17; #106; niu-lxs.18)

Revalidation contradicted the earlier broad remediation note: the Provider portal consumed media records, but administrator Usage still rendered only text and could report no consumption for media-only activity. The portal also omitted recorded meter quantity. Both authorized surfaces now use the same Niu-specific media consumption composition with actual units, immutable payout terms, accrued/earned amount and unpaid amount. Missing media data remains unavailable rather than empty. No customer workspace surface imports this composition.

The storage projection previously summed rational numerators without their denominator. It now preserves the denominator and groups matching denominators separately; the client displays exact fractions instead of guessing whole units. The additive denominator field is required for displaying a known quantity; older responses without it show Usage unavailable. This does not alter saved earnings, charges or settlements. Full fractional database acceptance remains required before closure.

The two Provider suites passed 41 tests, including administrator media-only fractional quantities and member media-only/mixed text data. TypeScript passed after removing a stale import; the dashboard build passed. Browser fixtures verified administrator and non-admin Provider-viewer pages at desktop and 390px, plus administrator navigation-open 1024px. A first rendering hid unpaid amounts behind a wide table; the final table groups model/specification/usage and accrued/unpaid values into three columns using installed primitives. At 390px it measures 358px client/scroll width with all recorded figures visible. These checks apply Carbon table readability and NN/g truthful state from ux-review, using the existing Niu financial-table pattern.

The isolated PostgreSQL prepaid-video settlement regression is running; no result is claimed here. Remaining acceptance includes its result, a fractional-quantity backend regression and final commercial visibility/reconciliation verification. No merchant payment or paid upstream request was sent.

### 2026-10-22: Administrator offer continuation and current-rate lookup (UX-20; #106; niu-lxs.21)

Current-source inspection found that the earlier continuation correction covered the Provider portal only. Administrator offer counts and its rate editor still used the capped summary. Administration now exposes scoped continuation, preserves loaded rows on failure, deduplicates new records, labels partial counts and filters as loaded-only, and offers retry plus refresh recovery. Editing a later offer refreshes through authorized pages until its current terms are found instead of treating absence from the preview as absence from the Provider. Cursor non-progress is rejected.

An actual 1,000-row administrator browser fixture loaded the 1,001st offer, removed continuation at the end, filtered to that offer and opened its current input/output rates. At 390px the editor remained usable; Escape restored the exact offer action. Existing small-list cases and new continuation/current-rate/failed-page-retry regressions passed in the combined 43-test Provider suites. TypeScript and dashboard build passed. No rate mutation was submitted. This extends prior portal boundary evidence to the administrator consumer and satisfies the finding's authorized-collection access scope. Criteria: ux-review's GOV.UK pagination guidance, truthful partial counts and NN/g recovery; installed table/menu/dialog patterns remain intact.

The media settlement regression is still running. A proposed fractional projection probe was removed after confirming earnings are immutable: the regression must create a valid fractional earning rather than update an existing ledger record. That additional acceptance remains pending; no pass is claimed until execution completes.

### 2026-10-22: Rich-content fidelity acceptance (UX-15; #105; niu-lxs.16)

Current response styling preserves decimal ordered markers and distinct disc/circle nested unordered markers. A saved Markdown fixture starting at 195 was inspected at desktop, 900px and 390px beside headings, quotations, fenced code, a table and rendered math. At 900px the continued ordered list retained start=195 and decimal styling, measuring 748px client/scroll width; nested lists retained their own markers without overflow. Narrow wrapped lines retained visible sequence numbers.

The Copy action displayed Copied; a focused regression verifies that the clipboard writer receives the original Markdown exactly, including continuation and nested syntax. The saved-backend export regression now includes the same kinds of rich content and verifies the downloaded JSON payload rather than reconstructing it from rendered text. The 63-test Chat integration suite passed after extending export coverage, and the added exact-copy regression passed separately. Browser clipboard readback was unavailable in the automation bridge, so exact copied bytes are supported by the component regression, not a claimed native clipboard read. Criteria: Tailwind Preflight's documented list reset and WAI content-structure semantics cited by UX-15; no screen-reader conformance or broader generation readiness claim.

### 2026-10-22: Media regression prerequisite failure (niu-lxs.18)

The PostgreSQL prepaid-video regression completed with a failure before media settlement: the unpriced-supply rejection expected 400 but received service-unavailable 503. Its fixture had no configured platform currency or valid payment setup. The fixture now configures CNY and an inert matching test gateway before customer setup, preserving the production global prerequisite. A new run is active; no pass is claimed yet.

Source inspection also established that accrue_supplier_media_earning constructs Quantity::integer from reported usage. Fractional ledger settlement is not a currently supported product path. The UI's denominator-aware fractional fixture is a defensive formatting check; supported acceptance requires the actual integer media earning, charge and settlement chain, not mutation of an immutable ledger or an invented fractional settlement feature.

### 2026-10-22: Terminal Chat edge validation (UX-18; #105; niu-lxs.19)

Revalidation found a malformed-shape gap: a streaming JSON null could throw a JavaScript property-access error. The parser now rejects null, arrays and non-array choices with a comprehensible invalid-stream message. New cases cover null, malformed JSON and empty text ending at the output limit. Existing tests cover retained partial text, absent terminal marker, cancellation, unknown finish reasons and saved reload.

Saved empty-limit and failed-partial fixtures were inspected at desktop and 390px. Output limit, no returned text, failure guidance and retained partial content remain distinct; no finished empty response appears to be waiting. TypeScript and dashboard build passed. The 67-case integration run had 63 passes and four default five-second timeouts, without assertion failures, while Rust compilation was active. A single-worker rerun with a 15-second per-test bound is active; it is not yet acceptance evidence. This remains incomplete pending the rerun and the authorized request/persistence lifecycle gate.

The media test prerequisite correction initially failed compilation because the test attempted to mutate private checkout configuration. The readiness module now exposes a test-only currency-aware helper, while its existing helper retains the USD default. The CNY fixture calls that helper; the revised PostgreSQL run is active. No production configuration visibility or permission was expanded.

### 2026-10-22: Provider appearance and pricing-scope follow-through (UX-09/UX-01; #102)

The existing selective monochrome-logo treatment was verified in rendered dark and light Provider directories: OpenRouter and AWS remain recognizable, while Azure, Google Cloud and New API keep their original colors. Readable names remain present. This meets UX-09's normal-size visual acceptance, using the skill's consistency and brand-preservation criteria; it is not a WCAG logo-contrast claim.

The directory still incorrectly instructed operators to configure selling prices per workspace. Its guidance now sends selling prices to Pricing and distinguishes workspace model access and limits. The final rendered copy was checked at desktop and 390px without clipping. Platform-default runtime/customer handoff acceptance remains tracked under UX-01.

### 2026-10-22: Chat rerun and media currency-guard correction

The complete 67-case Chat integration suite passed in a single-worker rerun. The earlier saved-settings loading timeout also passed in isolation without changing assertions or test waits. The malformed-stream correction is covered; this does not replace the remaining live request/persistence acceptance.

The configured-CNY media settlement regression exposed a production schema interaction before dispatch: media offer identity revisions require NULL currency and text rates, but the platform-currency trigger rejected their NULL currency. Migration 0363 restricts that trigger to monetary text revisions. Existing media rate-card triggers continue to enforce the configured currency, and the media revision shape constraint remains unchanged. No historical price or ledger row is converted. The configured-CNY settlement rerun is pending; no success is claimed yet. The currency follow-through was reopened in Beads.

### 2026-10-22: Video setup ownership and generation handoff (UX-06; niu-lxs.7)

Task boundary: creating videos and revisiting generated results belongs to Generations; maintaining reusable Provider materials and required identity verification belongs to workspace setup. Retaining a separate setup destination preserves independent management and saved-operation recovery. Combining it with generation would mix prerequisite administration with each prompt; removing it would discard a useful management entry. Existing pages were inspected before this decision, so this is not a blind navigation study.

Workspace navigation and its derived title now say Video setup. Its introduction states the actual responsibilities and links to Generations with the readable workspace scope. Existing routes/bookmarks, Materials and Human verification tabs, permissions and saved records remain intact. This uses the existing Niu sidebar/tab composition and applies ux-review structure-and-language's task ownership and knowledge-boundary criteria, rather than introducing a new layout.

Rendered verification covered desktop 1280px and 390px, the workspace navigation entry, named key/model choices and the linked Video composer with the same workspace slug. Unsupported model setup explicitly keeps actions unavailable and saved-history access visible. The initial minimal video-model fixture lacked controls and caused a render exception; with the complete supported response shape, the handoff loaded correctly. TypeScript passed. No generation, material mutation or identity-verification submission occurred. This closes naming/ownership UX-06, not retained-output lifecycle UX-14 or general record URL UX-08 (the existing key query still uses an internal identifier).

The media settlement regression now passes offer publication and reaches recovery, but fails because the expected Provider earning is absent. The next run adds read-only failure evidence for execution, usage observations and pricing/offer bindings. Settlement acceptance remains open.

### 2026-10-22: Media earnings and settlement acceptance (UX-17; #106; niu-lxs.18)

The configured-CNY PostgreSQL regression exposed a second independent schema interaction: the optional cached-prompt-token constraint evaluated FALSE for media earnings with NULL text counts. Migration 0364 explicitly permits NULL cached counts while retaining the text-meter and prompt-subset constraints for present counts. Migration 0363 separately preserves currency-less media offer identities while continuing to guard monetary rate cards. Neither migration rewrites historical amounts or prices. Temporary diagnostic retry code was removed before acceptance.

The full prepaid_video_reserves_before_egress_and_settles_reported_usage_once test passed against fresh PostgreSQL migrations. It covers admitted/reserved customer pricing, reported media usage, Provider earning independent of a failed customer debit, restart recovery, repeated settlement, supplier payment reconciliation, media projection quantity/denominator and customer/foreign-Provider visibility. Combined with the prior 43 Provider UI regressions and populated administrator/member desktop/narrow verification, this satisfies UX-17's supported media consumption scope. No real merchant or paid upstream request was sent. The reopened currency follow-through is verified by this configured-CNY lifecycle.

### 2026-10-22: Consolidated media pricing ownership (UX-02; #102; niu-lxs.3)

Organization settings no longer hosts a competing media-price editor. Admin Pricing remains the normal home for platform text/media prices; its Existing media contracts dialog retains company-scoped inspection, replacement and retirement of pre-existing customer media contracts without advertising new customer-specific publication. Company continuation deduplicates company records, preserves loaded choices on failure and retries the failed cursor. Existing financial data and compatibility APIs remain intact. Provider onboarding guidance now also names platform-wide prices.

Missing eligible models link to Provider setup in a separate tab, preserving the original form; Refresh model choices reloads options without losing the entered price or keyboard focus. This follows the existing installed dialog/menu/table composition and ux-review's task ownership, scope and error-recovery criteria. The administrator guide now points to the same owner.

Five focused suites passed 18 tests covering organization-role removal, company continuation/retry/scoping, existing media history and rate publication. TypeScript and dashboard build passed before the final small refresh-focus correction. Browser checks covered desktop and 390px company menus, a populated contract, nested rate details and Escape returning first to the exact rate action and then the Pricing entry. Initial customer fixtures lacked the required maximum quantity; after correcting the fixture, details displayed correctly. No rate mutation was submitted. Final role/hand-off acceptance remains open under UX-02; no whole-product completion is claimed.


### 2026-10-22: Platform pricing and media ownership acceptance (UX-01/UX-02; #102)

The real PostgreSQL/router customer handoff now registers a model, qualifies its Provider and offer, activates supply, and publishes a platform text price. A newly provisioned customer discovers the model and uses it without a workspace tariff or enrollment. Insufficient credit stops the request before upstream egress; trusted fixture funding permits the request and records one customer charge. The isolated `customer_console_provisioning_handoff_preserves_company_isolation` test passed. This extends the earlier two platform-default storage tests and fourteen billing regressions; it does not replace their historical revision, media-dimension, unavailable-price and access coverage. Legacy contracts and stored selections remain preserved rather than migrated destructively.

Existing media contracts now uses the complete customer-company directory, including companies without workspaces, instead of deriving choices from workspace targets. Pagination retains choices across failure/retry and rejects non-advancing cursors. Names and creation dates distinguish choices without exposing internal IDs. Ordinary owner, administrator and installation organization-settings tests confirm there is no second pricing editor. The real-router `video_selling_configuration_requires_platform_administration` test passed for allowed platform administration and denied customer reads/writes, including publication, replacement and retirement.

Rendered Pricing inspection covered 1024px with navigation open and a measured 390px viewport. The narrow populated dialog measured 356px client and scroll width; the open company menu fit its viewport and Escape returned focus to Existing media contracts. The missing-model remedy opened Provider setup in a separate tab while the original entered price remained intact. Refresh preserves the draft and focus. The pricing guide was corrected to match the current single Pricing home, retained contract management and model-derived media specifications. Dashboard production build and the 821-page documentation build passed; the focused company-directory/organization/media-editor regressions passed (7 tests), following the broader 18-test pricing run. Browser data was synthetic and read-only; no live financial records were changed.

Criteria: NN/g match to real-world tasks, consistency, recognition and recovery support one pricing owner with contextual remedy links; WAI-ARIA dialog focus-return guidance supports the keyboard checks. Platform-wide default pricing is the user-confirmed Niu product requirement, not a universal UX rule. These results establish the scoped pricing repairs, not whole-product readiness.


### 2026-10-22: Payment prerequisite and funding-context continuation (UX-04/UX-05; #101)

The isolated native mock-payment acceptance passed with added assertions on the actual readiness and workspace endpoints: disabled, unconfigured and unavailable merchant states close the gate; enabled and recovered states open it. Pending, failed and cancelled individual orders do not close installation access. The existing real checkout, signature rejection, exact-once ledger, duplicate/stale/delayed events and restart checks also passed. This verifies the mock integration's operational state; production merchant adapters still establish configuration readiness only. The separate PostgreSQL removal/recovery regression remains pending at this checkpoint, including the corrected current EPay recovery route.

Source revalidation of UX-05 found that personal model tariffs were correctly removed but funding ownership was not serialized, leaving the UI unable to distinguish direct Provider billing from an absent customer tariff. The authorized workspace model response now carries a separate billing source derived from personal-route ownership. The catalog/detail presents own-key billing without misleading unpublished-price rows and keeps shared pricing and admission distinct. Missing evidence is explicitly unknown. No purchase price or credential is exposed. OpenRouter's actual [BYOK guide](https://openrouter.ai/docs/guides/overview/auth/byok) was inspected for the distinction between Provider-account spending and platform credits; its fees and fallback capabilities were not copied into Niu.

The model-table suite passed 25 tests, including own-key versus missing shared-price cases, and TypeScript passed. Rendered read-only fixtures were inspected at 1024px and a measured 390px viewport; the narrow document scroll width equaled 390px, the explanation wrapped, and both actions remained available. Backend personal/shared funding tests are running. The finding remains open pending full launch handoff, revoked/inaccessible states and applicable model-price coverage. NN/g match-to-user-task and visibility of system status support the distinction; funding ownership is not evidence of live availability.


### 2026-10-22: Payment recovery confirmation and Chat funding handoff

The isolated PostgreSQL payment readiness test now passes after confirming that removal of the last configured method closes workspace entry while readiness and the current administrator EPay configuration route remain accessible. This complements the native mock acceptance above; it does not add merchant activation evidence for production adapters.

The Chat composer now carries current selected-model billing information for saved workspace keys, including mixed funding and unknown cases; manually entered credentials do not inherit an unverified workspace classification. The model chooser identifies each selected route's source. During rendered inspection, the first placement overlapped saved response text at 390px; moving the hint inside the composer surface fixed it. The resulting viewport and document widths were both 390px. The changed chooser was inspected open, and an additional focus-return defect was repaired: Escape now restores the actual opener, with a persistent fallback for a removed hover-panel action.

A backend funding test initially stopped at the required global payment gate because its older fixture lacked setup. The fixture now explicitly configures the platform currency and inert test gateway; the gate remains intact. Backend funding acceptance is rerunning. The initial Chat regression run had 64 passes and three 5-second timeouts during concurrent Rust compilation; the unchanged functional assertions are rerunning with one worker and a 15-second harness timeout. Final passing results are not asserted at this checkpoint.


### 2026-10-22: Isolated Chat regression diagnosis

The two previously failing Chat outcome cases passed when isolated with one worker and the same 15-second harness timeout: an unknown finish reason persisted across saved-session reload, and an empty length-limited response showed a terminal outcome rather than waiting. Functional assertions were unchanged. A new integration test also passed for mixed own-key/Niu-credit selection followed by a manual key: the prior workspace billing claim is removed and no inference is sent. These three passing cases do not retroactively establish a full-suite pass. The backend funding acceptance remains live in compilation; its process was inspected rather than restarted. The getting-started guidance now carries the same billing distinction and payment prerequisite, with its documentation build still pending.


### 2026-10-22: Personal funding acceptance and verification build cause

The real-router PostgreSQL personal-key regression passed after the required installation payment setup was added to its fixture. It confirms authorized workspace funding-source presentation, owner scope isolation and inference without deducting the Niu prepaid balance. The shared-price regression is still running. The getting-started documentation build passed for 821 pages, and the rendered guide was inspected with the direct Provider billing distinction and common payment prerequisite intact.

Repeated gateway compilation was traced to build.rs watching the entire Git refs tree, including unrelated local tooling checkpoints. Follow-up bead niu-lxs.29 narrows watches to HEAD, packed refs and the active symbolic reference (or its existing parent while packed). Three disposable Git fixture tests pass: unrelated checkpoint exclusion, packed-to-loose/detached transitions, and linked-worktree provenance. The currently running acceptance was preserved; real no-op build verification remains pending. This is verification infrastructure support, not another product UX finding.

### 2026-10-22 — Named-key handoff and recovery verification (UX-08)

Chat now canonicalizes authorized legacy key references to their stable slug, including the fresh-draft URL transition. Explicit unavailable bookmarks keep sending disabled instead of silently selecting a different key. Choosing a manual key clears the saved-key query without restoring its billing claims. Video key selection and saved-request URL writers prefer slugs; historical lookup includes revoked and expired keys while retaining generation restrictions. Browser checks confirmed Chat canonicalization and unavailable-key recovery against the read-only fixture. These checks do not establish production persistence.

The complete Chat integration file passed 69 tests. The Video integration file passed 35 tests, including legacy and slug bookmarks for revoked keys with no Provider dispatch. Video mocks were aligned with the SDK's current workspace session/task routes; the prior mocks incorrectly returned failures for valid saved-record reads. Dashboard type checking and production build passed. UX-08 remains open: cross-workspace history writers and public references for execution/session records still need migration and verification. Source-backed review criteria remain recognition rather than recall, explicit error recovery, and the Niu readable-URL constraint; no link is derived from private prompt content.

Follow-up verification on the same revision: Video legacy key links canonicalized to `video-review` in the browser. The 390px key menu stayed within the viewport; Escape returned focus to the key trigger. The PostgreSQL shared-customer-pricing acceptance passed after its exact expected response included the existing pricing source, optional rate fields, and discount-baseline revision. This complements the earlier passing personal-key inference/no-prepaid-debit acceptance; it does not establish live merchant readiness. Public-boundary checks passed for the six changed source/test/evidence files.

Build-verification follow-up (`niu-lxs.29`): rerunning the same PostgreSQL acceptance after intervening tool checkpoints reused the gateway test build (0.25 seconds, no compile step) and passed again. Together with the three isolated Git watch-set tests, this verifies the narrowed provenance invalidation without masking source, active-branch, detached-HEAD, or packed-ref changes.

### 2026-10-22 — Key recovery acceptance reconciliation (UX-27)

Revalidated the current implementation rather than relying only on the earlier browser record: all 29 key-recovery/client integration tests passed, and `workspace_key_recovery_handles_lost_responses_and_rechecks_access` passed against disposable PostgreSQL with the complete router. Coverage includes absent pre-commit outcome, same-identity replay, secret-free committed metadata, changed-input rejection, access loss, confirmed validation correction, HTTP 503 after commit, navigation/re-entry and explicit revocation. The 2026-10-21 browser-to-disposable-gateway fault-proxy run supplies integrated response-loss evidence and exactly-one creation/replacement assertions.

The authenticated OpenRouter key list and creation dialog are now directly inspected. Niu follows the name-first single-column form, expiration and grouped optional controls; model access is a real Niu capability. The recovery extension uses Niu's existing funding-reconciliation pattern, not an invented claim about OpenRouter. Current rendered Niu recovery at 1024px keeps Check saved result primary, explains the unknown outcome, and retains a visible reminder after Escape returns focus to New API key. This was a mutation-refusing fixture, not credential issuance. Earlier 1280/760/390 dialog and keyboard checks remain applicable to unchanged recovery markup. The evidence meets UX-27's error prevention, explicit outcome and recovery requirements; no live key was created, rotated or revoked for reference inspection.

### 2026-10-22 — History key-reference continuation (UX-08)

Saved-input links now omit redundant key IDs: their original association is restored from the authorized saved document. Standalone job links include a key only when its slug is known; retained revoked-key metadata is passed to history so its stable slug remains available. The SessionHistory and Video suites passed all 42 tests, including pagination, cross-workspace records, known revoked-key slugs and omission of unknown key references. SDK task-path fixtures were updated to current workspace routes. This does not close the separate public-reference migration for session, intent, job and diagnostic identifiers.

### 2026-10-22 — Recorded-block investigation acceptance (UX-26)

The full-router PostgreSQL regression now records a denial against policy version 1, activates a different policy, then reads the event as a workspace reader through the customer API. It verifies the event still reports the original version/name/reason/key name, exposes no key secret, and rejects another workspace. The same passing test verifies exact historical revision reads, missing-version responses, reader write rejection, restoration authorization and history pagination. This supplies real saved-revision evidence rather than relying on rendered fixtures alone.

The four affected frontend files passed 34 tests; after replacing internal-facing “detector” wording with “external input check,” the three affected policy suites passed 24 tests. Dashboard build and public-boundary checks passed. Current browser checks traversed Guardrails → Blocked requests → exact saved version → Return to blocked requests at 1024px, then inspected the list and scrollable history dialog at 390px. Changed configuration is explicitly distinguished from unavailable historical processing terms; the unavailable version is not silently replaced with current details. Escape closes the history dialog and focuses the history refresh action. Earlier reader rendering and the current backend permission assertions cover the read-only role. No policy was changed through the browser and no rejected prompt was exposed. These checks satisfy the skill's recognition, historical-evidence integrity, error-recovery and role-boundary criteria for UX-26.

### 2026-10-22 — Saved external-check selection acceptance (UX-21)

Added and passed `saved_detector_policy_restore_and_assignment_revalidate_current_eligibility` against disposable PostgreSQL and the complete router. A saved version references its original external-processing fingerprint. Both restoration and key assignment reject a changed recipient, a removed runtime, and a runtime no longer authorized for that workspace; matching configuration succeeds. Readers cannot perform either mutation. Failed operations leave the active version unchanged, and the original saved policy remains immutable. The local endpoint is deliberately unreachable: this test verifies current eligibility without transmitting any content or making an inference request.

All 26 affected frontend tests passed. Current browser inspection of the key assignment dialog confirms the selected version, explicit changed-configuration warning, separate current-recipient label, omitted unavailable historical terms, and exact revision link into history. The saved-version menu preserves focus on Escape. Prior recorded 760/390 open-menu and dialog checks apply to unchanged markup; current history dialog was also inspected at 390px during UX-26 verification. The matching/changed/missing/disabled fixture tests cover equal-count policies and failed metadata reads. Together these satisfy recognition, reviewable consequences and error-prevention criteria without inferring historical facts from today's configuration. Public-boundary checks passed. UX-21's implementation and authorized eligibility acceptance are complete.

### 2026-10-22 — API key to Logs handoff (UX-08)

Key details now pass the stable key slug into their compact request-list link. Logs resolves `key` slugs and legacy `keyId` references against the authorized workspace key inventory, and canonicalizes known legacy links without losing date/model filters or an open request fragment. Backend filters retain the internal key ID. An unresolved key blocks the request-list read and export; it never silently broadens the filter to all workspace requests. The error offers a removable filter and retry refreshes the key inventory.

All 62 GatewayActivity integration tests passed, including both bookmark forms, preserved fragments, exact API filtering, unavailable-key no-read behavior, recovery retry and the compact detail link. Browser inspection confirmed the detail link and named Logs filter at 1024px, plus the unavailable-key message and filter removal at 390px. The read-only fixture lacks request data, so its later 501 response is not evidence of production request retrieval. The existing Logs layout and controls are unchanged. Public-boundary checks passed. Aggregate Activity links without loaded key metadata, and session/intent/job/diagnostic public record references, remain part of UX-08; this is not a UUID-free-platform claim.

### 2026-10-22 — Activity key drill-downs (UX-08)

Activity now loads authorized key metadata for aggregate links. Named usage and charge rows use the key slug and retain existing date/model/status filters. Missing key metadata leaves aggregate values visible and suppresses the unresolved key-specific link instead of exposing its internal ID or navigating to a broader scope. Top-key rows explicitly say Key link unavailable. Key metadata completion no longer needlessly reloads the aggregate query when no key filter needs resolution.

All 63 GatewayActivity integration tests and the dashboard production build passed. Tests cover charge-group and token-usage slugs, preserved filters, and failed key metadata with retained totals. Browser inspection of read-only usage fixtures confirmed the named key links to `executions?key=video-review` and restores the same key filter in Logs. This verifies the handoff, not the completeness of fixture analytics. Public-boundary checks passed. The remaining UX-08 work concerns saved execution/session references rather than named-key Activity links.

Narrow follow-up: the 390px Activity key row keeps its name, usage and View requests action within the card, with readable wrapping and no clipped link. The existing layout was inspected after the slug change.

## 2026-10-22 — UX-23 model-centered configuration checkpoint

Tracked by `niu-lxs.24`. The Provider Models section now starts from the union
of configured model connections and loaded commercial offers. Previously a model
without an offer was absent here, and configuration was discoverable only inside
API key management. Models are now the default view; text and media rate views
remain available with a bookmarkable `view` query. Overview setup guidance and
readiness remedies lead to Models.

From a model, administrators can edit its mapping or its named Provider API key,
with the latter explicitly explaining its effect on every model using that key.
Adding a connection for an existing offer carries the alias into the form.
The existing model form loads recognized upstream choices on demand. Managing
an offer opens its existing editor with the model already selected, including
an authorized read through paginated offers before deciding that rates are new.
Offer qualification remains a separate explicit action. No API/storage contract
or credential-reassignment operation was introduced.

Personal connections explicitly identify Provider billing and do not acquire a
purchase-offer requirement. Commercial rows distinguish missing or unloaded
offers, Provider/offer review, paused offers and unavailable connections. They
do not interpret a saved mapping or credential as evidence of live upstream
verification. Inventory failures block editing rather than displaying an empty
list; uncertain writes close the submission form and reconcile through reads.
Authorization/provider changes discard editor context and abort outstanding
operations.

Reference and criteria: the actual model-list and named-credential screenshots
in [LiteLLM model management](https://docs.litellm.ai/docs/proxy/model_management)
were inspected, alongside Niu's existing model and credential editors. The
model-first organization follows that reference; commercial qualification is a
Niu-specific requirement. The skill's source-backed
[NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
apply to recognition, task context and visible state; its
[WAI-ARIA dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
applies to keyboard dismissal and focus return. No broader reference-product
feature parity is claimed.

Verification at this checkpoint: 45 tests passed across model task integration,
Provider qualification/rate workflows, existing model forms and Provider API
utilities. The dashboard production build passed. The actual app was inspected
with disposable read-only API fixtures at 390, 760 and 1024 CSS pixels. Narrow
search receives a full row and model entries stack; the 1024-pixel expanded-nav
canvas measured 700 pixels, with a 610-pixel table and no document overflow.
The upstream-model and named-key menus were inspected open; Escape returned
focus to the originating model action. The unpriced-model offer editor retained
its alias after collection reconciliation. These fixture checks establish UI
behavior, not successful production writes or upstream model availability.
Actual saved-configuration acceptance remains pending; this checkpoint does not
close UX-23 or the whole remediation goal.

The subsequent sibling regression run passed another 48 tests across Provider
business pages, the Provider list and API key/model configuration. Combined
verification for this checkpoint is 93 tests; saved-configuration acceptance is
still pending.

## 2026-10-22 — UX-23 persistence acceptance

`model_setup_reads_saved_configuration_and_rechecks_revisions` passed against a
fresh disposable PostgreSQL cluster through the current `/api/v1` router. It
created a Provider/credential/model without an offer, read the model through a
new router instance, updated the mapping and credential, rejected stale
revisions, read the persisted model and key metadata through another instance,
and denied both inventories to a customer workspace owner. Credential secrets
were absent from the response. The test does not contact a real Provider.

That execution also established that the legacy `available` field is not
commercial qualification. The UI now explicitly calls it connection status and
keeps commercial offer status separate. A new regression verifies that a
connection reported available with no purchase offer does not receive a
commercial-ready claim. All ten model-task tests pass; the final status wording
was inspected in the rendered model list. Together with the prior 93-test and
responsive/menu evidence, this satisfies UX-23's scoped configuration and
recovery acceptance. Live upstream entitlement is deliberately not claimed.

## 2026-10-22 — UX-14 library implementation checkpoint

Tracked by `niu-lxs.15`. The workspace now has a Library navigation destination
for durable image/video/audio copies, separate from Provider Materials. Its
initial implementation lists authorized workspace assets, filters by media
kind, searches the loaded collection in a Popover, paginates, previews/downloads
through the authenticated asset API, and exposes revision-checked rename/delete
operations to writers. Read failures are distinct from empty inventories;
ambiguous mutations reconcile, name validation preserves the draft, and preview
object URLs are revoked on close/scope change. Retained video-result actions
link to the workspace Library instead of ending at a disabled saved label.

The actual Runway [asset organization guide and UI screenshots](https://help.runwayml.com/hc/en-us/articles/23998498329107-How-to-organize-assets)
were inspected for the persistent navigation destination, file list and object
management pattern. Niu does not imitate unsupported folders, sharing controls
or automatic retention. The skill's recognition, visible-state and recovery
criteria apply; workspace scope and explicit retention remain Niu constraints.

At this checkpoint, 22 Library and existing VideoResult tests pass. Browser
checks used read-only fixture metadata at 390, 760 and desktop widths, including
open media menus, search focus/dismissal and rename entry. The first desktop
check exposed an eight-pixel action-cell overflow; widening that column fixed
it. At 390 pixels the table measured 358 pixels with a 390-pixel document; at
760 pixels it measured 658 pixels with a 760-pixel document. Source-generation
context and return navigation, real retained-byte playback/lifecycle acceptance,
and final build verification remain pending. UX-14 stays open.

The final Library checkpoint build passed. Nine current Library tests pass,
including multibyte-name validation, revision-aware mutation recovery, menu focus
return and malformed-page recovery; the earlier fourteen VideoResult tests also
passed. Narrow browser verification additionally covered media-menu alignment,
search autofocus/Escape, visible retained query and 760-pixel layout. No test or
fixture result is presented as real retained-video playback acceptance. Remaining
UX-14 work is source-task metadata/authorized return navigation and the actual
saved-byte, upstream-expiry and deletion lifecycle.

## 2026-10-22 — UX-14 source navigation and media verification

The Library now links an authorized retained output back to its original Video
run. A permanent public reference resolves through the same workspace and
actor-private authorization as saved history. Shared-copy access does not reveal
an inaccessible private source. Video diagnostics and actions retain their
internal-ID contracts after resolution. Old job bookmarks canonicalize while
preserving other query state and fragments; the remaining session/input/request
reference migration stays tracked separately under UX-08.

The source-backed [WAI-ARIA modal dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
requires usable focus and dismissal. Direct-file previews now return focus to
the file button; menu actions return to their menu trigger. Browser inspection
at 390 pixels caught a title overlapping the close control; the heading now
wraps inside reserved close-button space. The dialog measured 358 pixels within
a 390-pixel document. At 760 and 1280 pixels, preview media, metadata and actions
remained grouped and available. This applies the skill's hierarchy/grouping and
responsive-task criteria, with Niu's existing shadcn primitives and tokens.

Controlled browser fixtures served real synthetic PNG and MP4 bytes. Both decoded;
the video reported readyState 4, one-second duration and no media error. The
Library source link opened `job=run-1000`, and the original task displayed its
retained video despite an expired upstream-reference state and no active key.
These fixtures establish rendering and navigation, not real Provider capture.
Forty-eight Library/VideoView regression tests passed; the subsequent focused
Library run passed all ten tests after the focus/title fixes. The SDK public-read
reference regression and dashboard production build passed. Handler OpenAPI
extraction/check covered all 299 registered annotated operations.

Database lifecycle verification is recorded separately once its final execution
completes; this browser checkpoint alone does not close UX-14.

The final PostgreSQL HTTP acceptance test
`retained_library_source_privacy_and_expired_reference_lifecycle` passed in a
disposable cluster with production-style multithreaded media processing. It seeded
retained video and last-frame captures with expired upstream references, resolved
their common authorized public source, hid that source from another workspace
member while allowing shared-copy reads, and rejected attempts to mutate the
public reference. A fresh router decrypted both MP4 and PNG copies byte-for-byte.
Viewer writes were forbidden; owner rename preserved source identity and rejected
a stale revision. Deleting the video removed its active asset metadata and marked
that capture deleted while leaving the retained image available. The cluster was
removed after the run. No real Provider or customer data was used.

After distinguishing pending diagnostic loading from unavailable billing, the
final single-worker Library/VideoView run passed all 49 tests and the production
build passed. An earlier concurrent run missed the existing one-second model
picker wait; no assertion or timeout was weakened, and the full affected rerun
passed unchanged. These results, the source-backed layout/focus checks above and
the prior management-state tests satisfy UX-14's scoped acceptance. This does not
claim successful real upstream capture or completion of the remaining UX audit.

## 2026-10-22 — UX-16 current capability and bookmark recovery

Tracked by `niu-lxs.17` (GitHub #104). Catalog actions and Chat eligibility now
consume a common generation-capability projection from the current visible
registry snapshot. A configured Video schema prevents a Chat launch even when
catalog metadata incorrectly says text. Unsupported Video configuration exposes
neither preview. Missing legacy metadata remains explicitly unknown and manually
selectable, never an automatic affirmative Chat choice. Descriptive dual-output
metadata alone does not establish a configured Video workflow.

This applies the review skill's honest-controls and recovery criteria and
[Nielsen's error prevention and user control principles](https://www.nngroup.com/articles/ten-usability-heuristics/).
The inspected [OpenRouter Video model detail](https://openrouter.ai/x-ai/grok-imagine-video-1.5-lite)
uses a dedicated Video playground. Niu follows that task separation: catalog
output labels, preview action, example and destination agree. Old Chat bookmarks
for Video models offer an explicit Video handoff preserving model and workspace;
unavailable models offer model selection instead of silently substituting a
model. Saved Chat history remains accessible. Recovery replaces stale composer
header controls while preserving history access.

The disposable PostgreSQL HTTP test
`generation_catalog_uses_current_video_routes_not_stale_modalities` passed for
text, unknown, descriptive dual-output, stale text/current Video and subsequently
unsupported Video configuration. Member projection excludes upstream identity.
All 48 affected frontend tests across five files passed, as did the dashboard
production build and OpenAPI entrypoint check. Generated API contracts document
the nullable capability fields. Configured preview capability does not promise
key authorization, funding, policy admission, supply eligibility or upstream
availability; Video still performs authorized discovery before use.

Controlled browser inspection covered 1280, 760 and 390 CSS-pixel layouts,
Video handoff with the selected model, open model menu and Escape focus return.
At 760 pixels the document measured 760 and the main region 700, with no Chat
launch and a model/workspace-preserving Video URL. The old-link recovery showed
its Video title and actions without stale key controls. Narrow layouts preserved
a readable task flow and did not overflow. These are rendered fixture and local
HTTP results; no paid generation or real upstream availability is claimed.

## 2026-10-22 — UX-18 durable terminal outcomes

The current Chat frontend integration suite passed all 69 tests. The disposable
PostgreSQL HTTP test `chat_terminal_outcomes_survive_router_and_store_reopen`
passed ten outcome combinations: normal stop, partial and empty output limits,
filtered output, tool action, unknown and absent reasons, malformed/unfinished
failure and cancellation. Each was saved through the authenticated handler and
read through a new router and Store instance. Latest results and earlier turns
retained their content, phase, reason and error; hydrated accounting fields were
not mistaken for client-owned result fields. This verifies durable state rather
than only a browser-memory fixture. The initial fixture lacked required global
payment configuration and received 503; the final run includes that prerequisite.

Authorized local-upstream stream transport acceptance is tracked separately in
`niu-lxs.19`. Neither these database results nor the frontend suite establish
real external Provider execution or live merchant readiness.

The combined PostgreSQL run subsequently passed both terminal-outcome tests.
`chat_terminal_reasons_cross_authorized_stream_transport` exercised real local
HTTP dispatch through dashboard authentication and a scoped active key to an
owner-funded synthetic Provider. Stop, length and content-filter reasons, partial
content and the terminal stream marker survived the gateway response. This is
controlled network acceptance, not an offline parser replay or paid external
Provider execution. Together with the previously rendered terminal-state checks,
69 frontend tests (including saved reload), and independent authenticated database
reopen verification, it satisfies the scoped UX-18 behavior and persistence
criteria. The checks cover complementary layers, not a single browser-to-external-
Provider end-to-end run. External Provider availability is not established.

## 2026-10-22 — UX-08 Chat bookmark verification

Chat records now receive permanent `chat-` references independent of titles and
prompt content. UUID aliases and public references resolve through the same
workspace and personal-owner authorization. Save receipts return the reference,
so new history links use it immediately. Recent history is no longer the only
lookup path: an explicit bookmark can directly retrieve an older conversation.
Canonical replacement preserves unrelated query parameters and fragments.

The PostgreSQL HTTP acceptance passed after adding receipt/reference equality,
UUID/public lookup equivalence, owner exclusion and database immutability checks.
Seventy-two Chat tests passed, including a new-save link without reload and older
bookmarks in both forms; the seven history-component tests also passed. API
contracts were regenerated and the 299-method entrypoint check passed.

Browser inspection of an older conversation at 1280, 760 and 390 CSS pixels
confirmed canonical navigation, preserved content and a readable history link.
At 760 the main region measured 700 pixels; at 390 the document measured exactly
390 pixels. The mobile history drawer and its action menu remained accessible;
Escape closed the menu and returned focus to its action trigger, matching the
[WAI-ARIA menu keyboard guidance](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/).
The fixture intentionally omitted optional token counters, exposing a crash that
unit fixtures with complete counters had missed. Missing counters now show
Unknown; the regression and browser rerun passed. This applies the skill's honest
status and resilient recovery criteria rather than inventing usage values.
The isolated fixture lacks some unrelated Video history responses, and its
partial-history notice is not presented as a production history failure.

This verifies the Chat portion only. Video sessions, saved inputs and remaining
request drill-downs still require migration under `niu-lxs.9`.

## 2026-10-22 — UX-08 Video session references

Video timelines receive immutable `video-` public references. Direct reads resolve
within the existing authorized workspace and actor; mutation identities remain
internal UUIDs. SDK reads accept only the matching category's public-reference
format. History links use the returned reference, while old bookmarks replace
their session parameter and preserve the remaining query and fragment. Subsequent
turn actions use the resolved session identity.

The disposable PostgreSQL HTTP test
`video_session_public_references_preserve_private_scope` passed, verifying UUID
and public reads, actor exclusion and immutable references. Ten Video session and
history UI tests and three SDK migration tests passed. Gateway check, dashboard
build and generated API documentation passed. Actual browser navigation replaced
the old UUID bookmark, retained its unrelated query/fragment and showed the same
session and active history entry. At 390 pixels, document width was 390 and the
refresh action remained accessible; the existing header truncated the title.
This is saved-state reading only, not generation or upstream availability testing.
Remaining saved-input and request links are still tracked under `niu-lxs.9`.

## 2026-10-22 — UX-08 saved Video input references

Saved input reads accept permanent `input-` references without changing dispatch
identity. The restored object supplies the internal ID used for explicit submit
and erase. A mismatched returned identity is rejected. The database HTTP test
passed for old/new read equality, actor exclusion, immutable public reference and
unchanged submission key/request digest. Fifty-five affected intent/history/Video
view tests and four SDK migration tests passed. The final focused VideoView run
passed all 40 tests after adding query/fragment assertions for both bookmark forms.
Those assertions exposed a second URL writer overwriting canonical references;
restored-job navigation now retains the input reference and original fragment.

Browser checks at 1280, 760 and 390 pixels confirmed restored saved input, explicit
not-submitted status, readable history and old-link replacement preserving query
and fragment. No generation was submitted. The 390-pixel document measured 390;
the settings panel remained within the viewport. Its missing accessible name was
added and verified as Video settings. This applies the skill's honest status,
context preservation and accessible overlay criteria. The inspected browser case
was an unsubmitted saved input; populated-job URL preservation is covered by the
focused integration tests rather than represented as the same browser evidence.
API docs and the production build passed before the final restored-job URL fix;
that final change still requires the normal final build checkpoint. Remaining
session/turn query metadata and request drill-down references remain in UX-08.


### 2026-10-23 — UX-08 request and nested Video reference verification

Tracking: `niu-lxs.9`. Request metadata now exposes the durable run reference;
authorized direct reads accept either that reference or the legacy attempt UUID.
Logs resolves off-page bookmarks and canonicalizes the fragment. Chat result
hydration, Video diagnostics links and cross-workspace Activity links consume the
server reference. Saved Video timeline links no longer include redundant internal
session/turn query hints. Restoration retains the authoritative session binding.

Evidence: scoped request integration over the local authorized stream transport
passed (one database test, three terminal-reason scenarios); the nested Video
input/session-binding database test passed. Logs has 64 passing integration tests,
Video/session views 44, and global Activity 18. Dashboard production build and
API generation passed. A build check caught a dropped session binding in the
Video response projection; the correction is covered by legacy-bookmark URL
normalization with persisted session binding.

Browser: synthetic read-only fixture, populated Video timeline at 1280 and 390 px;
saved input navigation retained its content and public reference. Off-page Logs
request opened from both legacy and public references, with identical metadata;
canonicalization retained workspace scope. Detail layout inspected at 1280, 760
and 390 px, with usable close control, readable values and no visible clipping.
Escape dismissed details and removed only the request fragment. Fixture request
payload retrieval intentionally remained unavailable; this verifies metadata
navigation and the failure affordance, not payload persistence or real billing.
No upstream paid request or real payment occurred.

Criteria: the skill's continuity/recovery and visible system-status requirements
are met for these observed transitions; the repository readable-URL constraint is
met for the inspected links. These checks do not establish exhaustive route
coverage or closure of the remaining product review.


### 2026-10-23 — UX-08 history projection follow-up

The final producer audit found that the standalone Video history projection
discarded the public run reference supplied by saved task inventory. It now
preserves that reference through pagination and merging with live entries.
The seven history tests pass, including first-page and paginated run links.
The not-dispatched input recovery also preserves the existing URL fragment
when removing a stale job query. These changes do not change dispatch identity
or permit replay of uncertain submissions. Final rendered standalone-history
verification remains pending; populated Video-session timeline verification
above is a different surface.


### 2026-10-23 — Standalone Video history rendered verification

Tracking: `niu-lxs.9`. A read-only fixture containing an ungrouped saved task
confirmed its history entry targets `job=run-1003`, rather than the internal
attempt UUID. Desktop 1280 px and the open mobile history drawer at 390 px
were inspected: the row retains its title and icon, long text truncates within
the navigation width, and the public destination remains exposed to assistive
technology. Escape dismissed the drawer. This check verifies the history link
producer; authorized run retrieval was verified separately above.

Commercial qualification acceptance (`niu-lxs.6`) initially stopped at the
installation payment gate because its older fixture had no configured gateway.
The fixture now sets platform USD and the existing isolated test gateway before
commercial inference. No production readiness logic was weakened; the rerun
remains pending until its process result is collected.

The isolated commercial qualification rerun passed (1 test, 1.32 seconds). It
exercises approved supply through a local HTTP Provider, independent customer
and Provider ledger rates, invoice replay, and offer revocation: the next
inference is rejected while previously recorded customer charges remain intact.
This is backend acceptance evidence; it does not certify production payments
or replace pending rendered qualification/access decision checks.


### 2026-10-23 — UX-05 billing decision walkthrough and Video correction

Tracking: `niu-lxs.6`, related issue #101. Read-only browser fixtures verified
that a personal model detail explains direct Provider billing without Niu credit
deduction, and that this context survives the Try in Chat handoff. An inaccessible
bookmarked key is not replaced silently: the composer shows an explicit remedy,
leaves Send disabled and requires choosing an authorized key. At 390 px the
message and key control remain visible; selecting the saved key resolves its
slug and restores the correct own-key billing explanation. No inference was sent.

The shared Video detail exposed a concrete semantic defect: a Video-only route
was presented with text-token input/output prices. The detail now omits token
price rows for Video-only routes and explains the existing request-settings cost
estimate prerequisite for Niu-credit-funded Video. Chat-capable model token
prices and direct Provider billing remain distinct. This applies the skill's
match-between-system-and-real-world and error-prevention criteria: visible cost
units must match the actual task, and the next pricing decision must be clear.
No new price, billing capability or upstream rate is fabricated.

The ModelTable suite passes 27 tests and the production dashboard build passes.
The final Video detail was inspected at 1280 and 390 px: funding text wraps,
modality facts remain separate, and the primary Video action is visible without
misleading token-price rows. This verifies these observed decision states; the
remaining commercial qualification presentation and operational payment
prerequisite evidence are not implied by this result.


### 2026-10-23 — UX-05 commercial supply scope and responsive header

Tracking: `niu-lxs.6`. The Provider directory now explicitly labels its status
column Commercial supply and explains that personal API keys do not require
commercial approval and are billed by the Provider. This prevents commercial
qualification status from appearing to prohibit personal use. Synthetic unknown,
qualified and unqualified states were inspected; unknown data remains unknown,
and missing/expired/revoked qualification links to the Provider review remedy.

Browser inspection found that the directory's two full-text header actions hid
the page title at 390 px. Both actions now use the existing shared compact-header
pattern, preserving visible desktop labels, accessible names, the standard Model
pools navigation icon and the Add Provider action. At 390 px the page title is
visible; both actions fit. Desktop 1280 and intermediate 760 px were also
inspected. Add Provider opens the existing dialog; Escape dismisses it and
returns focus to the trigger. No provider was created or changed.

ProviderList tests pass (13). The change follows the skill's explicit scope,
recognition and responsive hierarchy criteria, with no new readiness inference
from merely connected keys. It does not establish live merchant readiness.


### 2026-10-23 — UX-05 acceptance closure and UX-04 evidence boundary

`niu-lxs.6` is closed against the recorded personal/commercial/unpublished-price,
revocation and inaccessible-key evidence above. This closure excludes the
installation payment prerequisite tracked in `niu-lxs.5`.

The remaining UX-04 gap is confirmed in `payments/readiness.rs`: real adapters
qualify from configured checkout/methods, whereas mock readiness includes a
service check. Configuration alone does not prove the required merchant and
integration readiness. This is an implementation gap, not simply a missing
production payment test.

Primary-source inspection: [Stripe account retrieval](https://docs.stripe.com/api/accounts/retrieve)
exposes `charges_enabled`, capabilities and requirements;
[Stripe webhook endpoints](https://docs.stripe.com/api/webhook_endpoints) are
separately configured. An enabled endpoint alone does not prove signed callback
receipt. [ZhifuX integration documentation](https://docs.zhifux.com/read/zhifufm/api)
requires the corresponding collection account before API integration and
distinguishes monitored collection from contracted payment channels. Its
inspected API list documents order creation, callbacks and order queries; this
inspection does not establish a universal merchant-health endpoint. Do not
invent such an endpoint or use a successful unpaid order query as proof of
collectability.

Design constraints for the correction: distinguish saved configuration from
verified collection capability; bind evidence to the exact gateway configuration
and currency; invalidate prior evidence on material credential/endpoint/method
changes; keep callback/reconciliation/settlement recovery accessible while the
workspace gate is closed. A single customer cancellation or failure must not
invalidate installation readiness. Unknown initial evidence must fail closed.
Transient outage policy needs bounded freshness, rather than either a network
request per workspace operation or an indefinitely trusted cached success.
Mock verification remains explicit and isolated from production evidence.
These constraints are not a claim that the correction has been implemented.


### 2026-10-23 — UX-04 Stripe account evidence transport

Tracking: `niu-lxs.5`. Added a read-only Stripe account-status operation to the
existing fixed-origin transport. The own-account `GET /v1/account` endpoint is
confirmed by [Stripe's official SDK](https://github.com/stripe/stripe-node/blob/master/src/resources/Accounts.ts);
`charges_enabled` semantics are documented in the account API referenced above.
The operation returns only account identity and the explicit collection-enabled
boolean, discarding the rest of the merchant response. Missing/malformed fields,
wrong object/identity shape, non-success status, redirect, and oversized bodies
return a fixed sanitized verification error. It retains no-proxy/no-redirect
transport, a five-second total bound, and a 64 KiB body cap including chunked
responses. It never creates a checkout or writes accounting data.

The dedicated loopback HTTP regression passed (1 test, 10 response cases). Its
initial sandbox run could not bind a local socket; the authorized rerun passed.
No real merchant endpoint or credential was used. This is a tested transport
foundation only: gateway readiness, configuration-bound evidence persistence,
callback verification and administrator recovery are not yet wired to it. Do
not treat an account's collection flag alone as installation readiness.


### 2026-10-23 — UX-04 configuration-scoped evidence persistence

Tracking: `niu-lxs.5`. Migration 0369 and storage methods add server-owned
verification attempts scoped by gateway, a 32-byte effective-configuration
digest, and evidence dimension (account or callback). No merchant response,
credential or customer financial data is retained. Attempts allocate their
sequence before external checking; a late completion cannot displace a check
started later. Completion is one-shot, and unknown/pending/failed/expired
results are not positive evidence. Mock evidence is excluded from this store.

The storage layer requires callers to select a bounded validity interval; its
30-day ceiling is a storage validation bound, not the installation freshness
policy. Configuration digest derivation, verification orchestration, recovery
UI and the composite admission decision remain separate unfinished work.
Existing customer orders and balances are untouched by these methods.

Storage compilation passed. The isolated PostgreSQL regression is pending; it
covers mismatched configurations, evidence dimensions and gateways, late
success after newer failure, expiry, duplicate completion, invalid validity
intervals, and reopening the store. No acceptance result is claimed until its
terminal output is collected.


### 2026-10-23 — UX-04 evidence ordering result and Stripe binding

The configuration-scoped PostgreSQL evidence regression passed (1 test, 1.13
seconds), including expiry, out-of-order completion and fresh Store reads.
The Stripe transport now derives a domain-separated HMAC digest binding its
API credential, API origin, mode and caller-supplied context. The focused
transport test passed. Gateway binding includes merchant identity, callback
signing secret, mode, platform and checkout currency, success/cancel URLs and
allowed methods. Its specific gateway test is pending. No digest or raw
configuration is added to customer responses.

UX-08 (`niu-lxs.9`) is closed against its scoped reference, legacy-resolution,
immutability, UI and browser evidence recorded above. UX-04 remains open: these
new evidence primitives still require orchestration and the administrator
verification/recovery journey before replacing configuration-only readiness.

### 2026-10-23 — UX-04 administrator account check and recovery feedback

Tracking: `niu-lxs.5`. The Stripe verification API exposes configuration-bound
account/callback evidence separately and provides an explicit, bounded account
check. The initial API regression passed (0.96 s); the expanded authorization
regression also passed (0.99 s), proving that a customer company Owner cannot
read or run platform verification. Anonymous callers are rejected before any
merchant request. Successful account checking leaves callback evidence false;
a disabled account revokes the account evidence. Gateway compilation and API
contract generation passed. The earlier gateway configuration-digest test also
passed, covering each effective checkout and callback setting.

The existing gateway card now offers “Check Stripe account” for a configured
real Stripe integration. It explains that no payment is created, distinguishes
account rejection, disabled collection and an unavailable check, and keeps the
card's configuration status separate from the outcome. In-flight checks abort
on session change; late responses cannot populate a different user's page.
Six focused dashboard tests and the production build passed. Existing bundle
size and mixed-import build warnings remain unchanged.

Rendered review used the actual dashboard route with isolated synthetic API
responses, never a real merchant. At 1280 CSS px the original two-column gateway
composition remains; at 760 px the cards use 658 px of content width after the
rail and 21 px canvas gutters, and at 390 px they use 358 px with 16 px gutters.
Neither measured layout overflowed the viewport. Success and credential/charge
rejection feedback remained beside the check action. Keyboard activation,
expanded intermediate navigation and Escape dismissal were inspected. The
browser viewport was restored afterward. These are rendering and interaction
observations, not production payment certification.

Criteria: the ux-review skill's source-backed NN/g visibility-of-status and
error-recovery guidance requires distinguishing verified outcomes and naming a
usable remedy; WCAG reflow and keyboard criteria motivate the narrow-layout and
keyboard checks. The existing gateway-card pattern and Niu's shadcn components
were retained. Stripe's account API, already inspected above, supports only the
account-eligibility statement; it cannot justify a “payments ready” label.

A further policy correction is under verification: account evidence lasts ten
minutes and a background check runs at startup and every five minutes. Pending
or transiently unavailable checks may consume only the remaining validity of a
previous success; they never extend it. Explicit disabled charges or rejected
credentials revoke the account evidence immediately. A cold start with no valid
evidence remains unknown. This bounds outage tolerance without making customer
requests call Stripe. The monitor, additive migration 0370 and policy regression
are not yet claimed as passed here. Composite gateway admission and callback
qualification remain unfinished; configuration-only admission is still present.

The outage-policy PostgreSQL regression passed (1.17 s), including migration
0370, an in-progress refresh and transient failure preserving only unexpired
prior evidence, one-shot completion, explicit failure supersession and expiry.
The expanded account API/monitor PostgreSQL regression passed (1.00 s), including
startup refresh and prompt shutdown. The transport classification regression
passed after its assertion was updated to distinguish rejected credentials from
an unavailable check. API contracts regenerated successfully. These results do
not close UX-04: signed callback qualification and the composite readiness gate
still need implementation and acceptance evidence.

### 2026-10-23 — UX-04 later product decision reconciled

The architecture follow-up (`niu-4rp.2`, also recorded in
`docs/reviews/architecture-review-2026-10-22.md`) contains a later user decision:
“Allow funded or granted self-hosted workspaces without merchant setup.” The
original human reply was inspected and confirms the recorded decision. This
supersedes the earlier UX-04 statement that funds or grants cannot provide an
exception. It is a changed product contract, not a verification waiver.

The shared acceptance scope now requires an authorized company/workspace funding
path as well as the merchant-backed path. Funds belonging to a different tenant
must never bypass the prerequisite. Dashboard readiness and backend admission
must agree, including direct URLs, existing sessions, grant removal and funding
recovery. Merchant account/callback evidence still distinguishes configured from
operational integrations, but must not become a universal requirement for the
newly authorized self-hosted funding path. Current implementation does not yet
satisfy that exception. The two beads are related; no issue is closed by this
reconciliation.

### 2026-10-23 — UX-04 checkout-bound signed callback evidence

Migration 0371 captures the effective gateway digest before a newly claimed
Stripe checkout contacts the merchant. It deliberately does not backfill old
orders. The binding is immutable; a saved legacy checkout cannot acquire the
current configuration during replay. Signed callbacks settle their original
order first, then may record integration evidence only when that immutable
binding matches the current configuration. A foreign configuration, unpaid
order, invalid signature or failed settlement supplies no positive evidence.
Callbacks for disabled checkout or legacy orders still retain their existing
settlement/recovery behavior. Replays cannot replace or refresh the original
receipt timestamp, and mock mode never records real-gateway evidence.

The durable callback receipt proves that this specific checkout configuration
has completed signed delivery and settlement. It does not establish present
merchant eligibility; that remains the separate, bounded account check. It is
therefore distinct from the expiring account evidence introduced earlier.
The administrator verification read now uses these proven callback receipts,
not a generic account-check outcome.

Isolated PostgreSQL evidence: configuration/settlement/replay boundaries passed
(1.13 s); the signed-callback regression passed (1.18 s), including invalid and
unpaid notifications, injected settlement rollback, recovery with checkout
disabled and later qualification under the original configuration. Actual
checkout-creation lifecycle verification is recorded in the following result.
No real payment or merchant endpoint was used.

The first attempt to extend the pre-existing multi-currency checkout fixture
failed because it created CNY data after configuring the platform as USD. The
existing legacy fixture is now retained intact as one case; a separate case
uses the configured USD path and asserts the captured digest. This preserves
legacy-currency coverage while testing the current configuration contract,
rather than relaxing the one-time currency guard.

Both checkout lifecycle cases passed: legacy multi-currency behavior (1.49 s)
and current USD configuration capture (1.17 s). The latter also proves that
server reconciliation alone does not claim signed callback delivery. No UX-04
closure is implied: the newly reconciled self-hosted funding path and composite
readiness integration remain outstanding.

A fresh single-worker dashboard suite is running. It has already reproduced
failures in session permission/revocation handling, gateway recovery,
organization switching, Provider navigation, read-only media pricing and Video
billing. These are observed test failures, not yet classified product defects;
the suite has not produced terminal totals. Do not infer a green whole-product
regression result from the focused passes recorded above.


### 2026-10-23 — Scoped funding admission and transient recovery (UX-04 / niu-lxs.5)

The later self-hosted decision is now applied to authenticated company scope in the readiness endpoint, workspace creation, workspace routes and inference admission. An explicit funding receipt, an uncorrected noncash grant or a current approved credit allowance qualifies only its own company and platform currency. Empty accounts and arbitrary adjustments do not qualify. Setup eligibility is separate from spendable capacity: exhausting credits must not remove access to history/settings; dispatch retains monetary reservations. Revoking the only credit allowance, or correcting the only wholly unused grant, removes that funding alternative. Merchant qualification remains a separate unfinished part of this finding.

The dashboard binds readiness to both session and company, aborts stale requests and clears readiness immediately when either changes. A transient check failure hides the affected content while retaining same-scope drafts; a confirmed setup block discards the retained view. Online/focus refresh and explicit retry restore it. Page-header actions are hidden with the blocked content. Unknown readiness now explains connection recovery rather than incorrectly demanding configuration; administrator configuration/funding remedies appear only for a confirmed missing setup.

Verification: the initial scoped PostgreSQL acceptance passed (1.06 seconds), including another-company denial, scoped model access, directory recovery and creation refusal with HTTP 503. The original gate/removal recovery acceptance passed (1.37 seconds). A local synthetic Provider streamed actual content and stop/length/content-filter outcomes through a funded workspace without merchant setup; request history remained authorized (1.29 seconds). No paid upstream call or real payment was used. A subsequent acceptance adds removal of a wholly corrected grant; its result must be checked before claiming that branch verified.

The full dashboard suite passed 113 files / 980 tests after correcting five stale fixture/expectation groups and two product regressions (draft loss and the video rate currency prefix). This full run preceded the final transient-error copy/header-action correction; focused follow-up and type checks cover that last change separately. The readiness hook has five passing tests, including online recovery and confirmed-block retention clearing.

Rendered isolated fixtures at 1280, 760 and 390 CSS pixels showed wrapping recovery actions, readable spacing and no clipped blocker content. The ordinary company owner saw the administrator handoff without privileged links; administrator fixtures exposed payment and funding destinations. The failure view was rechecked at 390 pixels after removing the stale header action and misleading setup instructions. Automatic readiness recovery restored the API-key list. These are synthetic UI responses, not proof of a live merchant.

Criteria: ux-review visual-review interaction/recovery rules, grounded in NN/g error recovery and GOV.UK preserving user progress, require distinguishing unavailable service from missing setup and retaining valid input. The narrow-layout checks exercise the skill's reflow review; they are not a complete WCAG conformance claim. The self-hosted funding alternative is a Niu product decision, not a universal design rule. Getting-started guidance now explains that alternative and its company boundary.

Follow-up evidence: the final funding batch passed all three isolated PostgreSQL tests in 1.75 seconds, including corrected-unused-grant removal, company isolation, self-hosted streaming and the pre-existing EPay unfunded-order regression. The final transient-state UI correction passed 60 focused tests; its explicit header-action/error/retry regression passed within 52 AppLayout integration tests. TypeScript passed.


### 2026-10-23 — Stripe operational admission (UX-04 / niu-lxs.5)

Real Stripe admission now requires both unexpired account eligibility and a settled signed-callback receipt bound to the same effective configuration. Saved credentials alone, account eligibility alone, or an old configuration's receipt cannot unlock the installation. The development mock retains its explicit sandbox health check, and the authorized company-funding alternative remains independent. Transient account-check failure preserves only the original remaining validity; a definitive rejection revokes admission. Updating account evidence after recovery reuses callback evidence only if the configuration is unchanged.

The isolated gate/recovery acceptance passed in 1.08 seconds and exercises those transitions, including changed webhook credentials. Test helpers now seed synthetic evidence through actual storage constraints on a separate fixture company; they do not introduce a production bypass. Representative regressions passed: saved model configuration and store/router reopening (1.13 seconds), actual synthetic upstream terminal streaming (1.32 seconds), and workspace guardrail authorization (1.10 seconds). Payment administrator documentation now explains the separate account and callback checks and the owner-accessible funding route while feature access is blocked.

Remaining scope is explicit: EPay/ZhifuX admission still uses configuration checks, and the payment card still needs a visible breakdown of current verification and the next recovery step. Do not close UX-04 on the Stripe backend result. On this date, the [ZhifuX order-query documentation](https://docs.zhifux.com/read/zhifufm/querybyoutno) states query access requires a separate permission and warns against repeated expired-order queries. Therefore order polling is not a general merchant-health probe; do not silently add periodic polling as an account check.


### 2026-10-23 — EPay and native ZhifuX evidence binding (UX-04 / niu-lxs.5)

EPay checkout creation now captures a credential-keyed digest atomically with the first deterministic checkout. Existing completed checkout replays cannot acquire today's configuration. A signed matching callback records qualification only after settlement. The checkout acceptance passed its new pending, invalid-amount, successful settlement, replay and changed-return-address checks. The callback fault-injection test exposed two valid timeout layers (bounded storage HTTP 503 versus outer handler deadline HTTP 502); its expectation now accepts either documented failure while preserving no-acknowledgment/no-credit/retry assertions. A full payment regression is required after this adjustment.

Native ZhifuX captures effective configuration before contacting checkout creation. Migration 0372 preserves a signed, configuration-bound notification independently of settlement. Qualification requires both facts, in either arrival order. Readiness derives the conjunction from committed records, so a worker failure after committing settlement cannot permanently lose qualification. Reconciliation alone and notification alone do not qualify; changed configurations and duplicate receipts do not manufacture evidence. Existing legacy payments retain settlement behavior without backfilled qualification. These are integration checks, not undocumented live merchant-account probes; the separate Stripe account freshness policy remains intact.

Adapter unit/local-transport suite passed 26 tests in 5.01 seconds, including new credential/context binding assertions. All network fixtures are local; no merchant was contacted or real payment executed. Gateway payment-suite verification is still in progress at this entry. The payment card currently exposes configuration and a Stripe check button but not the complete evidence breakdown; its next-step guidance remains required before UX-04 can close.


### 2026-10-23 — Payment verification visibility and recovery (UX-04 / niu-lxs.5)

The complete isolated payment suite passed all 14 tests in 7.19 seconds after correcting the native fixture reference to the supported alphanumeric format. This includes configuration binding, signed notifications, independent settlement, replay, scoped funding and timeout recovery. The adapter suite separately passed 26 tests. No real payment or merchant connection was used.

Administrator payment configuration now includes a sanitized verification snapshot computed by the same function as admission. It separates checkout enablement, currency compatibility, account verification where supported, payment notification verification and readiness. Company funding never certifies a gateway. The response remains platform-authorized and contains no merchant identity, secrets, digest or monetary amounts. Generated API contracts and reference documentation were refreshed; a follow-up backend suite covers the shared snapshot and authorization.

Payment cards retain Niu's existing gateway layout and add explicit evidence rows, missing-step guidance and a Credits handoff. Only ready evidence receives a green Verified state. Refresh failure removes prior verification success, and a 30-second/focus refresh catches out-of-page payment completion. Open configuration drafts are not reset by background refresh. The Stripe account action refreshes the shared state after its result. This follows the [Stripe Dashboard's documented pattern](https://docs.stripe.com/connect/dashboard/review-actionable-accounts) of separating status from outstanding requirements and providing a specific remediation path; no unsupported Stripe Connect capabilities were copied.

Eight page tests passed, including missing callback evidence, verified recovery, refresh failure, no implicit account-check POST, session abort and preservation of an open EPay draft. The dashboard build passed. Rendered isolated fixtures were checked at 1280, 760 and 390 CSS pixels; redundant copy was removed after inspecting card density. Navigation was checked open and closed at intermediate width. Credits opened the existing Settings dialog, Escape returned to the gateway page and restored focus to its actual opener. Pending evidence, successful automatic refresh and failed refresh were observed; stale success disappeared on failure. Narrow rows and actions wrapped without horizontal clipping. These are UI fixture results, not live merchant certification.

The skill's status/feedback and error-recovery rules apply here, separately from its visual grouping, density and responsive checks. Remaining UX-04 evidence still includes the native signed-route end-to-end check and in-flight settlement after gateway disablement. Source inspection found EPay notifications currently resolve the checkout-enabled runtime; disabling a saved configuration may therefore prevent settlement of older orders. Reproduce and correct that lifecycle boundary before closure.


### 2026-10-23 — Final payment lifecycle and currency-display verification

Refs: UX-04 / niu-lxs.5; niu-4rp.20 (currency-symbol correction only). The native ZhifuX local fixture now exercises checkout creation, rejected mismatched notification, replayed signed notification, independent worker query and one durable funding entry through the actual routes. Notification alone does not qualify the integration; the matching settlement does. This acceptance passed in the isolated PostgreSQL payment batch; no external merchant or paid upstream was contacted.

The EPay disablement test exposed a real lifecycle gap: the pending-order configuration guard also rejected a pure disable action. Configuration comparison now permits only enable/disable changes with all saved checkout fields unchanged, while the transactional revision guard and pending-order protection continue to reject signing-key or endpoint changes. Notification verification retains the saved credentials after checkout disablement. The expanded regression verifies credential rotation remains blocked, new checkouts stop and duplicate old-order callbacks credit once. Final batch result is recorded separately below.

Video billing's expanded calculation was inspected at desktop and 390 px: both the posted amount and exact original rate use the same currency symbol (CNY fixture: ¥0.123456789), values wrap without clipping, and Escape restores focus to Video details. This is presentation-only; no stored amount or conversion changes. It does not close the broader financial-precision review.

The final dashboard suite passed all 113 files / 983 tests (192.36 seconds). Generated API validation passed 301 handler operations, 401 REST operations and 383 SDK exports. UX-22's implemented owner/member handoffs retain their earlier browser and permission evidence; the explicitly required actual-user goal-prompt evaluation has not been conducted. Automated and expert walkthroughs are not substituted for that research.

Final isolated payment lifecycle rerun: **16 passed, 0 failed (7.13 seconds)**, including the EPay disable/rotation protection regression and the full native ZhifuX notification/query/settlement path. This completes the current UX-04 acceptance scope with the previously recorded UI, authorization and funded self-hosted evidence. It does not certify a live merchant deployment.

Final TypeScript/dashboard production build passed (Vite 1.60 seconds), with existing chunk-size and mixed static/dynamic-import warnings. Source changes remain uncommitted; the portable Beads snapshot was refreshed and no remote task/source publication was performed.

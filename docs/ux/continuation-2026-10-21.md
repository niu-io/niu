# Full product UX review — completion of the 2026-10-21 continuation

**Result: the bounded review is delivered; the product is not ready for self-guided commercial use.** The previous pass stopped before completing feasible state coverage. This continuation replaces its completion claim and supplies the missing role, failure, populated-content and recovery evidence. It does not claim that all possible defects have been discovered.

The review package is this execution/evidence record, the [task-first blueprint and boundary decisions](review-2026-10-21.md), and [detailed earlier findings](findings.md). The index below reconciles all **27 tracked findings**, including corrected observations; 27 is not a count of newly discovered or independently confirmed current defects.

## Contract, intent and evidence

The task remains **review only**: no product fixes, live policy/payment/pricing changes, keys, users or upstream model requests were submitted. Review documents changed. Browser drafts were discarded. Synthetic role/data responses and two temporary frontend probes were used to inspect otherwise unavailable branches. The fixture server forwarded static frontend assets only; it did not forward business API requests. Fixtures are evidence about the real UI implementation under supplied contracts, not proof of backend authorization, payment settlement or durable writes.

Baseline: working tree based on `858f8c80`, including existing uncommitted changes. The local running build is the observed version; this is not immutable release certification. Evidence labels: **L** live existing records; **D** operated unsaved draft; **F** isolated frontend fixture/test; **S** source/contract diagnosis; **B** consequential integration not executed. A lower evidence level never silently becomes a higher one.

The product promise is an operator's model delivery business with a convenient customer experience and understandable accounting. Review responsibilities in this order: service readiness → qualified supply and selling price → independent customer access/funding → usable request/result → later investigation/reconciliation. Current pages and backend objects do not determine the intended boundaries. Apply the current user instructions where older product documentation retains superseded Supplier terminology, workspace pricing or prescribed Settings partitioning.

Criteria: the skill's top-down task/ownership comparison, evidence ledger and complementary-pass method; [NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) for understandable status, recognition, prevention and recovery; [GOV.UK pagination guidance](https://design-system.service.gov.uk/components/pagination/) for usable continuation when content is split. These are expert-review criteria, not usability-study results. Niu's global payment prerequisite, confidentiality boundaries, readable URLs and full-width dashboard are project requirements, not universal UX laws. Visual judgments use the criteria linked in the [earlier visual assessment](visual-assessment.md).

## Completed task/state ledger

Every row has an outcome and evidence boundary. “Inspected” does not mean the journey passes.

| Goal / actor / start | Execution and evidence | Outcome and remaining qualification |
| --- | --- | --- |
| Establish usable installation / operator / absent payment configuration | L payment gateway cards, global Settings and mock warning; F no methods, zero account balance, owner workspace/key creation UI; S workspace key authorization and creation handler; F unavailable-login service recovery tests | **Fail UX-04:** workspace features and key creation remain available before valid payment configuration. The customer sees unavailable top-ups without a useful responsible-owner handoff. No merchant credentials changed or actual gateway activated (B) |
| Connect and qualify supply / operator / new or existing Provider | L Provider Overview, Models, API keys, routes and pools; D add-Provider/logo menu and route/pool dialogs; F Provider member role and large offer collection; S offers/credentials/readiness consumers | **Fail UX-05/23/20:** the task crosses credential-centric surfaces; qualified selling inventory is not equivalent to saved configuration; capped offers have no continuation. Credential submission, upstream health failure and actual offer publication remain integration qualification (B) |
| Publish customer prices / operator / configured model | L Admin Pricing, organization media editor, model choice; D media publisher; S rate/dimension contracts; F media publisher/history and customer rate tests | **Fail UX-01/02/24:** competing ownership and unexplained internal dimensions. No actual price publication or historical repricing (B); exact arithmetic tests do not validate usability |
| Onboard separate customer / operator then owner/member | L directory, organization/account and Users surfaces, add-user guidance; F owner/viewer roles, unavailable admin and owner-only Users; F login service/return, workspace recovery, slug and lifecycle tests | **Fail UX-03/25:** no coherent independently funded customer provisioning handoff; developer Quickstart assumes operator duties. Real invitation/token delivery, first login by another person and backend cross-account isolation are not established (B) |
| Fund and resume use / customer owner / empty, pending or paid | L account Billing, Payments, method dialog, saved paid order detail; F absent gateway, pending order, uncertain create, paid checkout removal, failed history/retry, read-only role and scope-change tests | **Fail UX-22:** funds, remedy and history lack one connected task home. Existing paid mock record explicitly retains simulated-funds/real-cost warning. No new checkout, bank payment, callback or balance posting (B) |
| Obtain and restrict access / owner/developer/viewer | L key list/create/limits, model detail; F viewer cannot create; F limits/source policy tests; two F response-loss probes for create/rotate; S post-commit response path | **Fail UX-27; UX-10 remains source-supported.** Successful one-time secret handling has tests; uncertain mutation recovery does not reconcile before retry. No live key issuance/rotation/revocation (B) |
| Generate, revisit and reuse / creator / ordinary or unknown model | L existing Chat/video history, cancelled/complete output, expired preview and restore affordance; F unknown modality model with Chat launch; S finish-reason processing and retained asset consumers | **Fail UX-06/14/15/16/18:** content meaning, capability, terminal status and retained-output discovery remain incomplete. Saved results are retrievable; no new model execution, media upload or restoration (B) |
| Diagnose and reconcile / member/operator/Provider | L Activity, Logs, saved failed request and blocked-request records; F Provider member media-only usage and 1000-offer boundary; F customer media statements and pagination/error tests; S consumer contracts | **Fail UX-17/20/26.** Provider media usage is omitted while customer media statements do have a consumer. No real Provider settlement or charge reconciliation (B) |
| Change guardrails safely / manager/viewer / saved policy | D hidden draft moved across sections; L history preview and blocked records; D synthetic regex preview returns Blocked; F policy conflict and readonly tests; S whole-policy PUT | **Fail UX-19/21/26:** hidden commit scope, insufficient historical check identification and missing denial-to-remedy linkage. Draft discarded; no live save, assignment, restoration or detector call (B) |
| Manage settings and lifecycle / owner/operator | L platform currency location, Admin Settings last, account preferences, workspace directory; D Chinese/punctuation slug generation and manual override; F rename/delete/recovery/role tests; S permanent empty-only deletion constraints | Corrected currency placement and responsive creation observed. Default deletion is protected; settings tests preserve conflicts/errors and scope changes. Actual deletion, credential change and persisted preferences across separate browsers were not performed (B) |

## Evidence register and repeatable probes

| ID | Probe and observed result | Interpretation / limit |
| --- | --- | --- |
| E01 | Viewer fixture: API keys read-only; Users says owner access required; workspace name/save disabled; direct Admin route denies access and retains workspace navigation | Correct frontend role affordances. Does not prove backend privilege boundaries |
| E02 | Owner fixture has no gateway/method and zero balance. New key opens; entering a name enables Create. Payments says online top-ups unavailable. `workspace_aliases::create_key` performs scope/permission checks without a payment-readiness prerequisite | Reproduces UX-04 without changing live configuration; no create submitted |
| E03 | Provider dashboard fixture supplies 1000 offers and `offers_has_more: true`. Rendered heading says 1000 offers; final displayed record is number 1000; no continuation entry | UX-20 confirmed in rendered real frontend. `crates/storage/src/providers.rs` emits the flag; consumer omits it |
| E04 | Provider dashboard fixture contains a media offer and nonempty `media_consumption`, with text consumption empty. Usage says “No model consumption yet” | UX-17 reproduced. Offer copy also says rates per million tokens, while media card only says rates vary by specification; agreed media rate is not inspectable there |
| E05 | Missing-modality catalog fixture offers Try in Chat and chat-completions setup | UX-16 reproduced as unsupported positive capability inference; no call dispatched |
| E06 | Saved long Chat response has ordered-list DOM, including a later list start value, but computed list style is none and screenshot has no visible numbering | UX-15 live reproduction; semantic markup alone did not preserve visual meaning |
| E07 | Guardrails: rename draft in one section, navigate to another section, Save remains enabled with only the latter controls visible. Shared submit sends the entire draft | UX-19 reproduced without saving; atomic save itself is legitimate if its scope is visible |
| E08 | Historical policy preview summarizes external checks as a count; saved denial rows expose reason/key/time/policy version without links to exact policy/check evidence | UX-21 and new UX-26. Some pre-dispatch denials are expressly not request logs; generic Open Logs is not an exact remedy |
| E09 | Two isolated `KeysView` probes reject create/rotate with a network error. No reconciliation GET follows; actions are re-enabled; create can issue a second POST | UX-27 observed frontend behavior. Backend source commits issuance/rotation before loading response details; post-commit response failure is possible, not induced live |
| E10 | Payment uncertain-create tests prevent automatic repost and expose saved-order recovery; Provider creation handles a write that may have committed | Counterexamples: uncertainty handling is already possible elsewhere. Do not require the same visual treatment for every operation |
| E11 | Live workspace name `  中文 测试 & Demo  ` produces `zhong-wen-ce-shi-demo`; after custom slug edit, changing name preserves the custom slug. Cancel restores directory and trigger focus | Earlier slug requirements work in draft. Collision and saved stability are tested/source-backed, not newly persisted here |
| E12 | Saved Paid mock order is reopenable. Detail explicitly warns simulated funds do not cover real model costs; account Billing separately shows available funds and balance activity | Positive recovery/provenance evidence; does not eliminate UX-22's missing direct funding handoff |

Source anchors: [key actions](../../apps/dashboard/src/features/keys/components/KeysView.tsx), [workspace key API](../../apps/gateway/src/admin/workspace_aliases.rs), [denial UI](../../apps/dashboard/src/features/guardrails/Denials.tsx), [history preview](../../apps/dashboard/src/features/guardrails/History.tsx), [Provider storage response](../../crates/storage/src/providers.rs), [workspace lifecycle UI](../../apps/dashboard/src/features/workspace/settings-page.tsx). Paths identify diagnostic evidence, not knowledge expected of users.

## New findings

### UX-26 — A blocked request has no precise policy-investigation handoff

**P1 · recovery/journey · live + source.** In the existing blocked-request list, an input or external-detector denial shows the key, time and policy version. Neither the reason nor policy is actionable. The only investigation action is generic Logs, although the page explains that these blocks precede dispatch and some admission denials are not recorded. The user must reconstruct which historical policy/check caused a block, and may search a log collection that cannot contain the event.

Criterion: meaningful error diagnosis/recovery and recognition rather than recall. This is distinct from UX-21: making a selection preview informative does not connect an actual denial to the relevant historical decision and responsible editor. Do not disclose rejected prompt content merely to improve diagnosis.

Proposed correction: attach authorized historical policy/check evidence and a scope-preserving remedy, or explicitly state which evidence is unavailable and how to obtain help. Keep pre-dispatch events distinct from dispatched request logs.

Acceptance: from a recorded block, the appropriate role can inspect the policy version and available cause, identify who can remedy it, and return to the event. A changed/deleted detector is labelled historically or unavailable, not silently replaced by its current configuration. A reader does not receive editing rights.

### UX-27 — Uncertain key creation or rotation is presented as safely retryable

**P1 · state/recovery · isolated frontend probes + backend source.** A network rejection leaves an error and re-enables Create/Rotate without checking saved state or warning that the operation may have committed. The backend issues/rotates before constructing the complete response. After response loss, a create retry can create a second credential; a successful rotation may have already invalidated the old secret while the user never received the new one. These consequences are inferred from the implementation path; they were not induced on real keys.

Criterion: distinguish unknown outcome from confirmed failure, prevent harmful retries, and offer a usable recovery path. An intentionally one-time secret is valid; pretending it can always be recovered is not a correction.

Proposed correction: reconcile operation outcome using a suitable request identity/status contract or an equally safe supported flow. Explain the uncertain credential state and direct the owner through explicit recovery. Preserve secret non-retrievability and prevent accidental duplicate issuance. Compare TopupFunding's existing uncertain-result handling rather than designing a generic retry loop.

Acceptance: test response loss both before and after commit, server error after commit, navigation/re-entry and role loss. No blind duplicate creation; rotation clearly communicates old-secret status and how to obtain usable replacement access. A confirmed validation failure remains directly correctable. Test frontend and backend together before accepting the repair.

## All findings reconciled

| ID | Current disposition and required response |
| --- | --- |
| UX-01 | Active: unsupported default workspace pricing/enrollment; follow user-confirmed platform pricing direction |
| UX-02 | Active, narrowed: Admin media publisher exists; competing pricing ownership remains |
| UX-03 | Active: separate-customer provisioning has no coherent operator-to-owner handoff |
| UX-04 | Active, stronger evidence E02: absent global payment does not gate workspace features |
| UX-05 | Active: distinguish personal use, configuration and commercial selling readiness |
| UX-06 | Active: broad Video destination opens native prerequisite tools rather than promised creation task |
| UX-07 | Old pools exposition/spacing complaint not reproduced in current sampled layout; do not reimplement it from stale screenshots |
| UX-08 | Partly corrected: workspace/Provider slugs work; record/session query references still contain internal IDs |
| UX-09 | Reproduced: dark OpenRouter logo loses recognition; inspect other dark assets in same treatment |
| UX-10 | Source-supported: unresolved capacity lacks matching-record investigation handoff; live exhaustion not induced |
| UX-11 | Partly corrected: catalog uses Default; Playground Popular still falls back to first usable models |
| UX-12 | Historical guidance lead retained with limited current evidence; Quickstart role defect independently confirmed as UX-25. Do not count every old currency instruction as newly reproduced |
| UX-13 | Corrected observed copy: creation now explains consequential limits; enforcement qualification is separate |
| UX-14 | Active, discovery evidence: retained assets have contextual attachment selection but no established later workspace discovery/management path; no claim of data loss |
| UX-15 | Reproduced E06: ordered output loses visible numbering |
| UX-16 | Reproduced E05: unknown modality becomes affirmative Chat launch |
| UX-17 | Reproduced E04 and expanded to media rate inspection; customer media statements are a positive counterexample |
| UX-18 | Source-supported: finish reason is ignored; transport end becomes Complete. Saved partial/cancelled samples inspected, fresh upstream edge cases not executed |
| UX-19 | Reproduced E07: hidden cross-section changes share a Save |
| UX-20 | Reproduced E03: capped offer set has no continuation |
| UX-21 | Reproduced E08: external-check preview substitutes count for inspectable identity/effect |
| UX-22 | Active: Billing/Payments/workspace spending still require users to reconstruct funding ownership |
| UX-23 | Active: supply setup follows credentials/offers/routes rather than complete model task |
| UX-24 | Active: media pricing requires internal channel/meter/specification knowledge |
| UX-25 | Active: first-request help conflates customer and installation operator |
| UX-26 | New: denial-to-policy investigation handoff missing |
| UX-27 | New: uncertain key mutation lacks reconciliation and safe recovery |

## Independent visual and interaction pass

Sampling was selected by composition risk: shared shell, populated management table, long rich output, nested dialog/menu, long editor, narrow detail, dark asset, denied-role and no-configuration state. This is broader than a page count, but is not formal accessibility conformance or every pixel at every viewport.

| Composition / input | Evidence and result |
| --- | --- |
| Shared shell, 1100px expanded/collapsed | Earlier live measurement: 68px rail + 256px sidebar leaves 776px main with about 23px gutters; collapsed main 1032px with about 31px gutters. Current sampled shell does not reproduce excessive fixed margins |
| Pools and workspace directory, 390px | 16px canvas gutters; wrapping actions; directory converts row details to readable stacked content. No new spacing defect established |
| Workspace creation, 390×844, keyboard/cancel | Full dialog and footer fit; name/slug/budget/reset visibly grouped, custom slug preserved, cancel restores focus. The owner label “Personal workspace” remains a scope ambiguity under UX-03/22 |
| Long saved Chat, 390×844 | Page/client width both 390; numbering visibly absent (UX-15). Cancelled versus Complete labels retained. A partially visible scroll region is not by itself composer overlap |
| Model detail, 320px dark, long mixed-language name | Name wraps, description clamps, details and actions reachable, scroll width equals viewport. Unknown model eligibility is UX-16, not a wrapping defect |
| Provider dialog and open logo choice, 390px dark | Menu fits/reflows; Escape closes menu then dialog; settled focus returns to Add Provider. OpenRouter dark mark remains hard to distinguish (UX-09) |
| Guardrail history preview, 390px | Dialog fits and closes; compact preview still omits consequential distinctions (UX-21). Fitting text does not validate information sufficiency |
| Provider 1000-offer collection, 1100px dark | Dense real rendering shows truncated collection with no onward action (UX-20); media offer's token-centric introductory copy is misleading (UX-17) |
| Account payment nested detail, 900px | Saved Paid status and mock cost warning readable; closing returns to Settings. Billing remains a separate balance-only destination |
| Administrative populated tables, 900px | Horizontal scroll observed earlier; not automatically a defect. Long-record identity/action association has not been comprehensively usability-tested |
| Role-denied and absent-gateway states | Clear readonly/owner/admin boundaries in fixture; no-gateway state lacks a usable setup handoff (UX-04) |

No claim is made about screen-reader traversal, all contrast pairs, localization expansion, browser zoom combinations or physical touch targets across every screen. These require a separately specified accessibility/device matrix, not a larger issue count. Existing positive menu/focus checks cannot certify every overlay.

## Automated evidence and failure triage

Full dashboard suite: **100 files, 827 tests; 801 passed, 26 failed**, with eight unhandled rejection reports. Targeted reruns of the ten failing files: **160 tests; 138 passed, 22 failed**. Separately, both temporary uncertain-key probes passed. No full green result is claimed.

- `ProviderNav`: one assertion still expects no Settings link in Admin; this conflicts with the required final Settings item. It is not evidence that the current navigation should remove Settings.
- Organization switching reaches creation but expects the old “Create a workspace” title; live dialog is “Create workspace”. The later request assertion also predates the slug payload. This failure does not establish broken organization switching.
- VideoView's sixteen failures and associated undefined-task errors use outdated response/endpoint fixtures for the generation/task flow. SessionHistory also supplies a stale response shape. These failures leave those test branches unqualified; they do not by themselves prove current runtime cross-workspace leakage or a crash.
- AppLayout retains a brittle fetch-order assertion and a bookmark/form expectation failure. VideoBilling retains an exact charge-calculation text assertion failure. These require focused test/implementation reconciliation before release; they were not promoted to unsupported UX findings.
- KeySourceAccess, CustomerMediaRates, PlaygroundView and SettingsNavigation failures from the concurrent full run passed in targeted reruns. This is instability evidence, not a claim the entire suite is now sound.
- Passing billing fixtures exercise pending/uncertain writes, order recovery, media-only statements, exact amounts, cursor failures and readonly behavior. Workspace lifecycle fixtures exercise scope changes, deletion protection, preserved errors and focus return. Their synthetic writes do not certify real backend lifecycle transitions.

Review-only scope preserves the product and its existing tests. Temporary response-loss probes were removed after execution; their inputs, observations and acceptance expansion are recorded in E09 and UX-27.

## Repair plan tested against the blueprint

The earlier boundary proposal remains appropriate only if it restores whole outcomes. A single attractive Billing page, model setup wizard or renamed Video destination is insufficient.

1. **Make service readiness and ownership real.** Resolve UX-01–04/25 together: platform-owned prices, valid global payment gate, a separate customer's owner/access/funding handoff, and role-appropriate help. Preserve operator setup/recovery while blocking unavailable customer features consistently in UI and API. An enabled gateway card alone cannot satisfy this gate.
2. **Complete supply-to-customer availability.** Resolve UX-05/23/24 with connected model, credential, offer, route, price and eligibility evidence. Keep advanced credentials/pools views where useful. Verify both personal testing and customer selling without presenting one as the other.
3. **Connect customer funds and reliable access.** Resolve UX-22/27, preserving scoped workspace budgets and account-wide funds. Test uncertain payment and key outcomes; ordinary failures and unknown commits require different recovery. Never merge procurement finances into customer Billing.
4. **Carry every supported outcome to later use.** Resolve UX-06/14–18/20: correct launch capability, terminal meaning, visible rich-content structure, retained-result discovery, complete collections and modality-aware Provider reconciliation. Customer media statements already work as a counterexample; adding another summary total is insufficient.
5. **Make diagnosis and changes safe.** Resolve UX-10/19/21/26 through exact event/record/policy handoffs, historical evidence and honest save scope. Then repeat role-restricted recovery and visual checks around the changed composition.
6. **Revalidate local and documentation corrections.** Resolve remaining URL, ranking, theme and guidance findings; retain corrected slug, currency, Settings order and pool spacing behavior. Check source-of-truth documentation rather than restoring superseded prescriptions.

Backward checks: a customer charge must trace to the customer tariff and request, while a Provider earning traces to the agreed offer and billable modality; neither may substitute for the other. A blocked request must trace to its historical policy and owner. A saved output must be rediscoverable and its availability understandable. A new customer must reach first usable access without upstream credentials. These checks expose the dependencies above and prevent treating individual issue closure as proof of product readiness.

## What the method learned and where this review stops

The prior miss was predominantly **failure to execute existing coverage requirements**, not absence of another general principle. The installed skill already requires coverage debt, role/state probes, reverse tracing and bounded completion. Repeating those words or encoding a Niu-specific “always add a Billing button” rule would not fix execution. This continuation applies its gate with an explicit ledger, controlled populated/failure fixtures, contrary evidence and reconciliation of every earlier finding. The previously refined task-first boundary and role-knowledge requirements remain in the local skill; no repository synchronization is performed here.

Complementary passes actually performed: forward role/setup/funding/access; backward outputs/charges/denials to producers and owners; populated/alternate-theme/narrow visual inspection; uncertainty and test-failure diagnosis. New confirmed mechanisms were UX-26 and UX-27; several old source-only leads gained rendered evidence. Because critical real transitions remain unexecuted, this is **bounded coverage, not diagnostic saturation, accessibility conformance or release approval**.

Remaining consequential qualification is explicit: independently provisioned customer/Provider sessions with backend permissions; merchant configuration and callbacks; actual tariff/offer publication; metered text/media requests through charge/earnings settlement; response loss after a real key commit; output retention/restore across time and browser; live security-policy conflicts/restoration and deletion. This review has exercised available frontend states and source paths rather than leaving them untouched because live writes were out of scope. None of these remaining transitions is marked passed.

The useful result is a repairable product-level assessment with evidence and acceptance conditions. Known core failures already prevent self-service readiness; spending more time polishing or repeating the same privileged page walkthrough would not change that conclusion.

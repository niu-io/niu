# Frontend workflow qualification

Status: **in progress; the full frontend goal is not complete.** Updated 2026-10-11.
This checklist supplements F01–F10 in [first-release.md](first-release.md).
Detailed observations are retained in the [evidence journal](frontend-workflow-evidence.md).
A working empty page or passing fixture test does not qualify a populated workflow.

## Scope and delivery rules

- Work locally on main at `localhost:2566` with HMR. Pull and preserve remote changes; ticos-m4 owns backend implementation, migrations, runtime infrastructure and performance.
- Follow [product focus](../product/product-focus.md) and AGENTS.md. Preserve NIU.IO tokens, direct installed shadcn primitives and Lucide/Tabler icons. Visual changes require the actual mature reference and existing NIU.IO Stitch project.
- Prioritize Supplier configuration and pricing → workspace keys → generation → Logs and customer billing. Verify desktop and narrow interactions; defer unrelated visual polish and packaging work.
- Exclude the separately owned external Agent Observability feature. Do not invent capabilities, product data, internal-ID labels, customer-visible procurement costs or browser-only durable storage.
- Configuration capability and external activation are separate. Preserve saved credentials and demo data. Do not create financial receipts, commercial qualification or paid requests merely to manufacture evidence.

## Current workflow status

Every row remains partial. Verified subsets below do not establish the entire flow.

| Flow | Verified implementation / rendered subset | Remaining frontend acceptance |
| --- | --- | --- |
| Authentication | Password login, sign-out, protected-route redirect, query-preserving return and reload restoration | Ordinary-role access, session expiry/revocation, production sign-in and installation distinction |
| Models | Global customer catalog, visible filter, sort/choice menus, model detail and selected-model handoff to Generations; saved Chat → matching Logs | Complete live-reference comparison, remaining failure states and real published customer-price display |
| Workspace API keys | Named list/detail, essential setup example, real creation/model grant, expiration, rename and rotation/revocation with old-secret rejection | Ordinary-role and cross-workspace authorization, remaining failed-write recovery and full lifecycle at narrow width |
| Chat | Durable named sessions, real success, streaming/cancellation, partial-output restoration, matching Logs and two-tab draft conflict recovery | Remaining upstream/draft transport failures, ordinary-role boundaries and protocol coverage |
| Video | Task-category entry, key scope, personal submission, saved success/preview, actual narrow MP4 download, Billing attribution and Logs round-trip; job-only navigation restores the original saved input and title | Fresh creation payloads, failed/unknown/expired/deleted states, ordinary-role denial and customer-funded billing |
| Logs | Real filters, retained content, measured timing, interrupted/unknown states, exports, deep-link restoration and narrow request detail | Fresh classified cancellation/timeout and video captures; export failures, protocol coverage and full diagnosis matrix |
| Activity | Real global/workspace totals, model and Today drilldown to matching Logs, narrow totals; validated request pages and cursor/overlap recovery in regression | Other date boundaries, task correlation and ordinary-role isolation |
| Guardrails | Saved input policy, historical live input block, current three-protocol local previews and version-8 restoration/history, narrow denial records and explicit refusal classifications in frontend regression | Live output withholding, current refusal browser states, ordinary-role management and complete supported protocol coverage |
| Settings / billing | Global dialog preserves origin; balance/empty history/unavailable top-ups, warning persistence and customer-only rate/statement fields | Populated rates/statements, credit-limit states, top-up recovery and funded request reconciliation |
| Admin Suppliers | Directory and named details, adapter/add-key dialogs, business profile and exact text-rate writes; existing model save/reload; credential RPM conflict/history and cooldown reads | Independent credential creation/rotation, changed model/subset writes, active cooldown/error states and ordinary-role boundaries |
| Customer pricing | Protected Admin page, named cross-company targets, platform token-model inventory, exact editor, optimistic revision/conflict recovery and paginated history; real target switching, empty state, menus and desktop/narrow dialogs | Real publication/current rows/history, real conflict/lost-response recovery and platform-only role qualification |
| Supplier business | Portal membership, own rates/usage/settlements; complete paginated earning selection, reconciliation and frozen payment retry payloads in regression; actual empty history | Populated browser earning/settlement paths, ordinary Supplier roles and durable recovery after closing/reloading an uncertain recording |
| Admin payments / branding | EPay disabled configuration save/reload, session-safe editor; branding preview/save/upload/reset and desktop/narrow checks | Enabled merchant lifecycle, remaining write failures and unsupported configuration contracts below |

## Concrete dependencies and authorization gates

| Dependency | Current boundary / required next evidence |
| --- | --- |
| Workspace route identity | Backend response has no stable route slug or retained rename aliases. Do not repair bookmarks with browser storage; require a durable collision-safe, authorized contract. |
| Authentication administration | No OAuth provider configuration lifecycle API. Keep the unsupported destination absent; require read/write/validation/secret-handling contracts before building it. |
| Merchant administration | EPay has dashboard read/write configuration. Stripe and Zhifux setup is server-managed; do not add invented dashboard write controls. Merchant entitlement and enabled checkout remain deployment-specific checks. |
| Financial acceptance | Follow the [capability inventory](../product/backend-capability-checklist.md#financial-capability-inventory). Customer pricing, balance funding, reservations/debits, reversals and statements need distinct evidence. Personal-key inference cannot qualify customer prepaid charging. |
| Fresh Video payloads | [Creation capture](../reference/video-request-payloads.md) is implemented. Old jobs are not backfilled. A new local single-submission authorization is pending; the previous single paid test was consumed. Do not resubmit automatically. |
| Provider model attribution | [Attribution](../reference/video-model-attribution.md) represents an explicitly returned model. OpenRouter may omit it; Unknown is correct for the exercised saved job. Do not substitute the configured alias. |
| Guardrail errors | [Preparation errors](../reference/guardrail-preparation-errors.md) distinguish `guardrail_denied`, `guardrail_output_withheld` and ordinary permission failures. The backend contract is available; current browser evidence remains required. |
| Cross-machine coordination | Shared main and contract documents are working. Direct Supen coordination is unavailable due to authentication; do not expand permissions or disclose credentials to work around it. |

## Next work in dependency order

1. Complete the actual independent Supplier credential/model-subset lifecycle and configuration-error recovery.
2. Qualify populated customer pricing and customer-only Rates/statement display using authorized real test data; keep commercial qualification and procurement separate.
3. Complete ordinary-role/key/session boundary workflows and stable workspace route handling when its contract is available.
4. Qualify current Guardrail input/output diagnosis, then the remaining Chat/Video failure, restoration and retention paths. Fresh paid Video submission waits for its specific authorization.
5. Complete top-up/configuration and financial-history recovery through supported APIs. External account activation does not block unrelated frontend implementation.
6. Compare changed screens with their actual references, complete the desktop/narrow interaction matrix and audit every row before claiming completion.

## Verification baseline

- Full dashboard regression: 90 files / 734 checks passed at the latest recorded full run; TypeScript checking passed. Subsequent scoped recovery checks are recorded separately in the journal.
- Current actual browser evidence includes saved personal Chat/Video, narrow Video download, Logs restoration, customer-pricing target/menu/dialog reads, existing model mapping persistence, disabled EPay persistence and empty earning selection.
- Fixtures are confined to tests and do not establish live acceptance. No full workflow row or F01–F10 release gate is marked complete.

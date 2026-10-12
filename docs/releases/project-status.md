# Project delivery status

Baseline v1; updated 2026-10-12.
Committed audit source `ab33ee17`; native implementation `ab33ee17`.

**Backend acceptance checkpoints: 24/36 recorded complete at their evidence pins.**
**Whole backend subsystems closed: 3/12.**
These are acceptance-checkpoint counts, not coding percentage, fresh execution of every path or release readiness.
Existing scoped evidence is carried forward explicitly. Missing evidence remains open; fixture outcomes have zero signal.

Source of truth: [project-status.json](project-status.json). Scope changes require a versioned reason; they cannot silently change the denominator.
Status meanings: open = unfinished; active = explicitly assigned current work; blocked = identified dependency prevents progress; done = every stated criterion has evidence; delegated/deferred = separate ownership or excluded scope.
Active implementation: S02-3, S08-2, S05-2, S10-2, S03-2, S04-3, S03-3, S05-3, S06-3. Assignments use stable task IDs.

| Subsystem | Owner lane | Status | Completed checks | Dependencies |
| --- | --- | --- | ---: | --- |
| S01 Identity and workspaces | A | done | 3/3 | None |
| S02 Supplier configuration and model catalog | A | active | 2/3 | S01 |
| S03 Inference protocols and route coordination | B | active | 1/3 | S02, S04, S05 |
| S04 Key controls and Guardrails | A | active | 2/3 | S01 |
| S05 Pricing, balance, charging and reconciliation | B | active | 1/3 | S01 |
| S06 Payment integration capability | B | active | 2/3 | S05 |
| S07 Request diagnostics and usage reports | C | done | 3/3 | S03, S05 |
| S08 Video jobs, results and assets | C | active | 1/3 | S02, S04, S05 |
| S09 Durable Chat | C | open | 2/3 | S01, S03, S07 |
| S10 Platform configuration and security facilities | A | active | 2/3 | S01 |
| S11 Contracts, SDK and documentation | I | done | 3/3 | None |
| S12 Runtime operations, recovery and performance | I | open | 2/3 | S03, S05, S07, S08 |
| S13 Dashboard, public catalog and rendered Help | Frontend | delegated | 0/3 | S01, S02, S07, S09, S11 |
| S14 Packaging, extensions and legacy surfaces | Separate ownership | deferred | 0/3 | None |

## Fixed acceptance items

### S01 — Identity and workspaces

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S01-1 | done | Workspace creation/list scoped access, durable identical retry, changed retry refusal and restart for the exercised legacy workflow. | [record](../../docs/releases/backend-interface-gaps.md) (`3fdc669c`) |
| S01-2 | done | Member authentication, expiry/sign-out, company/workspace roles and cross-scope administration match the declared backend contract. | [record](../../docs/reference/parallel-core-backend-acceptance.md) (`fb21b52a`) |
| S01-3 | done | Freeze workspace route compatibility with the frontend owner; reject inconsistent updates/deletion without losing retained business data. | [record](../../docs/releases/backend-integration-contract.md), [record](../../docs/reference/parallel-core-backend-acceptance.md) (`ab60bba3`) |

### S02 — Supplier configuration and model catalog

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S02-1 | done | One Supplier with independent credential mappings preserves the other mapping during local replacement/disable and supports actual calls. | [record](../../docs/reference/supplier-key-isolation-live.md) (`59922df`) |
| S02-2 | done | All required management, membership, catalog and qualification operations have exact published contracts and ordinary-role isolation. | [record](../../docs/reference/parallel-core-backend-acceptance.md) (`fb21b52a`) |
| S02-3 | active | Complete configured-model, customer-price and eligibility publication journey, including stale revision and safe unavailable-capability states. | [record](../../docs/reference/platform-customer-pricing.md) (`606f863e`) |

### S03 — Inference protocols and route coordination

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S03-1 | done | The exercised actual text/tool-result streams retain reported usage, finish state and independently checked charges. | [record](../../docs/reference/key-controlled-tool-streaming.md) (`a9de7c8`) |
| S03-2 | active | Publish a finite supported Chat/Responses/Embeddings/Messages/GenerateContent matrix; qualify declared working combinations and explicit rejection of unsupported ones. | [record](../../docs/reference/inference-protocol-acceptance-matrix.md) (`1212ea3b`) |
| S03-3 | active | Close material timeout/cancellation/uncertainty and bounded fallback gaps on supported paths; preserve model, credential and financial identity. | [record](../../docs/reference/inference-failure-acceptance.md) (`1212ea3b`) |

### S04 — Key controls and Guardrails

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S04-1 | done | The exercised tool streams preserve key lineage, RPM and spending refusals across rotation/restart and revoke access. | [record](../../docs/reference/key-controlled-tool-streaming.md) (`a9de7c8`) |
| S04-2 | done | Close the matrix for single-key spending/RPM/TPM/concurrency/IP controls and mandatory parent-child policy composition; concurrent denials create no unauthorized dispatch. | [record](../../docs/reference/parallel-core-backend-acceptance.md) (`fb21b52a`) |
| S04-3 | active | Document and verify applicable F09 local/external input and output coverage, consent, preview/revision/rollback and fail-closed failure behavior. | [record](../../docs/reference/guardrails-acceptance-matrix.md), [record](../../docs/reference/buffered-output-policy-execution.md) (`1212ea3b`) |

### S05 — Pricing, balance, charging and reconciliation

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S05-1 | done | The exercised approved-credit text workflow has immutable-price debits, released holds, refund/reconciliation and restart without invented cash funding. | [record](../../docs/reference/internal-credit-workflow-live.md) (`b1223c0`) |
| S05-2 | active | Consolidate exact category/tier/fee, insufficient-capacity, concurrent liability, uncertainty and exactly-once recovery checks for the supported charging matrix. | [record](../../docs/reference/accounting-matrix-acceptance.md), [record](../../docs/reference/current-tier-fee-acceptance.md) (`5591a02d`) |
| S05-3 | active | Verify supported customer media, invoice and Supplier earning/settlement serialization and accounting mechanisms; track unavailable positive evidence separately from external activation. | [record](../../docs/reference/invoice-payment-boundary-acceptance.md) (`c24e75b7`) |

### S06 — Payment integration capability

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S06-1 | done | An administrator can read the truthful supported integration inventory independently of checkout activation. | [record](../../docs/reference/payment-aggregators.md) (`3fdc669c`) |
| S06-2 | done | Publish the supported checkout, signed notification/query, duplicate, currency/amount verification and recovery inventory with exact interfaces. | [record](../../docs/reference/payment-capability-matrix.md) (`af34b6a3`) |
| S06-3 | active | Establish supported funding/refund transitions and negative callback/idempotency protections from actual evidence; merchant activation is not a completion prerequisite. | [record](../../docs/reference/invoice-payment-boundary-acceptance.md) (`c24e75b7`) |

### S07 — Request diagnostics and usage reports

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S07-1 | done | The exercised mixed actual inference/report workload reconciles retained customer charges and report artifacts with source records. | [record](../../docs/reference/current-authentication-mixed-load.md) (`e704955`) |
| S07-2 | done | Close one request-to-Logs-to-usage-to-billing/export journey including full-range totals, pagination and unknown/error/timing states on supported protocols. | [record](../../docs/reference/reporting-acceptance-matrix.md), [record](../../docs/reference/inference-protocol-acceptance-matrix.md) (`1212ea3b`) |
| S07-3 | done | Verify ordinary customer visibility and procurement confidentiality in all required serialized reports/exports; classify unsupported diagnostic fields. | [record](../../docs/reference/reporting-acceptance-matrix.md), [record](../../docs/reference/inference-protocol-acceptance-matrix.md) (`1212ea3b`) |

### S08 — Video jobs, results and assets

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S08-1 | done | Actual personal video submission, key rotation, saved-job restart recovery, idempotent replay and independently decoded result are exercised. | [record](../../docs/reference/current-video-submission-restart.md) (`e704955`) |
| S08-2 | active | Close the supported input/control/job/result/retention/asset authorization matrix and recovery without duplicate submission. | [record](../../docs/reference/ingested-image-video-input.md), [record](../../docs/reference/workspace-material-library.md), [record](../../docs/reference/workspace-material-sdk-acceptance.md), [record](../../docs/reference/workspace-material-format-acceptance.md), [record](../../docs/reference/workspace-material-storage-acceptance.md), [record](../../docs/reference/workspace-material-video-reference-acceptance.md) (`ab33ee17`) |
| S08-3 | open | Implement or verify supported reported media meters, bounded liability and exact settlement; missing quantity remains explicit and never inferred from file duration. | Missing / not yet accepted |

### S09 — Durable Chat

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S09-1 | done | Guarded saved sessions reject stale/legacy resurrection, preserve durable revision state and retain actual source conversation content in the exercised run. | [record](../../docs/reference/chat-session-write-guards.md) (`7234a4ef`) |
| S09-2 | done | Close backend multi-turn history/detail/draft/settings/attachment persistence and deletion semantics for the declared Chat workflows. | [record](../../docs/reference/chat-backend-acceptance.md) (`1212ea3b`) |
| S09-3 | open | Deliver SDK adoption and conflict/reload handling to frontend ownership; mark browser/UI acceptance separately. | Missing / not yet accepted |

### S10 — Platform configuration and security facilities

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S10-1 | done | Inventory and publish platform authentication/branding/theme/payment configuration and member profile/preferences contracts with correct authority. | [record](../../docs/reference/platform-configuration-acceptance.md) (`4a459338`) |
| S10-2 | active | Verify supported secret/config persistence, audit/revisions and encryption-key rotation without changing existing identities or exposing secrets. | [record](../../docs/reference/encryption-configuration-acceptance.md) (`186662c5`) |
| S10-3 | done | Coordinate configuration changes, current permission checks and supported public-safe projections; reject arbitrary executable branding/config content. | [record](../../docs/reference/platform-safe-projection-acceptance.md) (`186662c5`) |

### S11 — Contracts, SDK and documentation

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S11-1 | done | A committed 236-method interface index resolves source operations and explicitly lists 20 root method gaps. | [record](../../docs/releases/backend-interface-gaps.md) (`d6904064`) |
| S11-2 | done | Close core root/handler schema gaps and manually map actual SDK methods; explicitly classify excluded/non-JSON/HEAD operations. | [record](../../docs/reference/parallel-core-backend-acceptance.md) (`fb21b52a`) |
| S11-3 | done | Validate the frozen frontend integration baseline and documentation HTTP/spec resources; delegate rendered browser acceptance when unavailable. | [record](../../docs/reference/backend-integration-handoff.md) (`dde36895`) |

### S12 — Runtime operations, recovery and performance

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S12-1 | done | Existing native runtime is ready with preserved identity, retained executable hash, matching registry and independently restored backup evidence. | [record](../../docs/releases/backend-workflow-status.md), [record](../../docs/reference/native-runtime-operations.md) (`c24e75b7`) |
| S12-2 | done | Consolidate supported restart/drain/migration/backup/recovery and explicit operational connection/deadline limits without container scope expansion. | [record](../../docs/reference/native-runtime-operations.md) (`c24e75b7`) |
| S12-3 | open | After business acceptance, measure increasing/mixed load, overload recovery, resources and exact post-run accounting; make only measured capacity/comparison claims. | Missing / not yet accepted |

### S13 — Dashboard, public catalog and rendered Help

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S13-1 | delegated | Integrate the frozen backend contracts and preserve brand/shared component rules. | Missing / not yet accepted |
| S13-2 | delegated | Complete desktop/narrow actual business journeys, permission/error states and data persistence. | Missing / not yet accepted |
| S13-3 | delegated | Verify standalone docs and embedded Help rendering/navigation against the published artifact. | Missing / not yet accepted |

### S14 — Packaging, extensions and legacy surfaces

| ID | Status | Acceptance | Evidence pin |
| --- | --- | --- | --- |
| S14-1 | deferred | Do not expand task benchmarking, subscription pooling or external Agent Observability as core gateway work. | Missing / not yet accepted |
| S14-2 | deferred | Coordinate existing legacy public surfaces and ownership before removal; preserve existing stored history. | Missing / not yet accepted |
| S14-3 | delegated | Perform image/container/private distribution qualification in its assigned scope, independently from native backend capability. | Missing / not yet accepted |

## Update discipline

- Change the JSON status and evidence together, then regenerate this page.
- A subsystem closes only when all its fixed items are done. Keep broader product acceptance separate from a bounded completed checkpoint.
- Reopen a completed item only with contrary actual evidence, recording the regression and affected revision.
- New work gets a new ID and scope-version entry; existing completion criteria do not grow silently.
- Lane I owns integration and shared contract/migration publication. Other lanes submit isolated changes and do not edit each other's files.

Run `python3 scripts/render-project-status.py --check` for board/link consistency only. It does not establish business correctness.

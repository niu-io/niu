# Niu 0.3 release readiness — expanded execution, 2026-11-17

Later repair and actual paid-video evidence is recorded in the
[repair verification](repair-verification-0.3-2026-11-17.md). The decision and
observations below describe this earlier snapshot, not the repaired candidate.

**Decision: do not promote this candidate.** Actual execution found a fresh-key handoff defect, an inaccessible public container distribution, inconsistent release provenance, and a deployed video qualification gap. This decision does not depend on fixture results or on treating missing checklist entries as product defects.

Tracking: `niu-nrcn`. This record extends the [earlier API verification](current-input-0.3-2026-11-17.md); [redacted structured observations](evidence/expanded-readiness-0.3-2026-11-17.json) retain the final request and artifact checks. Current task state and repair ownership remain in Beads. No production promotion, release publication, or product implementation was performed during this review.

## Candidate and method

- Hosted product: core `23cae63a8a5eb38a008ab5836ef2961c786e9cdf`, reported live at 12:20:41 UTC. Website artifact: `8d3f49200f0d99d27dd39e17d71b904ee3b34108`.
- Local source: `959c4ee1` on the 0.3 release line. Changes after the hosted core were release-checker, documentation and tracking changes, not product changes. Local results do not claim that this source tip was deployed.
- The browser was recovered and operated directly. The operator did not perform the tests. No clipboard permission bypass was needed.
- Hosted inference used a newly issued key restricted to `qiniu/conatus-free`, one concurrent request and a USD zero spending limit. The current published customer rates were zero. Video quotes used separate short-lived, model-restricted credentials; no paid video generation was submitted.
- Container checks used the actual locally built Dockerfile artifact, an existing v0.2.26 container, isolated PostgreSQL databases, current API-created records, real dumps and independent readback. They do not qualify retrieval of the published v0.3.0 image.
- Native execution used the current compiled gateway with the `mock-payments` feature present. Its live inference/billing run did not enable a mock merchant: it called the real staging model through the restricted free credential. Local funding and customer tariffs were isolated test-installation configuration, not real-money transfers.
- Mock-merchant diagnostics were also executed. Their simulated outcomes are excluded from release acceptance and from the decision below. No fixture-test outcome is used as evidence.

## Current-input outcomes

| User or operator goal | Executed journey and independently inspected result |
| --- | --- |
| Sign in and create a usable credential | Actual login form succeeded. Created a named workspace key through its Dialog, selected one permitted model, zero allowance, one concurrent request and finite expiry. Key metadata and model discovery independently returned 200. The immediate handoff to Generations failed as described below. |
| Recover and run a real conversation | Reloading the same route cleared the erroneous key block and recovered the saved prompt. Sending returned `UI_READY`; the request record independently retained 18 input / 65 output tokens, `stop`, and customer charge 0. |
| Use an attachment and revisit saved work | Attached a newly written text file through the browser. The model returned its exact verification phrase, `ATTACHMENT_READY`. The independent request record retained 64/7 tokens and charge 0. Reload recovered both turns. A separate authenticated API read recovered the exact attachment text and both responses. |
| Manage saved history | Renamed the conversation in its Dialog, exported the actual downloaded JSON, archived it, found it in the archived Dialog, restored it, then deleted it through confirmation. Export inspection found both exact responses and attachment text. Independent reads confirmed the renamed archived record and, after deletion, 404. |
| Use the interface at different widths | Inspected rendered screenshots at 1440, 1024, 768 and 390 CSS pixels. Document scroll width equaled viewport width in each observation. Desktop navigation/history and narrow collapsed layouts were visible; response status, cost and actions wrapped without horizontal clipping. Key/model menus and creation, rename, archive and revoke dialogs were operated. This is scoped interaction/layout evidence, not an exhaustive accessibility or visual audit of every page. |
| Connect an agent with limited authority | Created a fresh device request, reviewed it in the actual browser, selected 15 minutes, left model invocation disabled, approved, and exchanged the device secret for a credential. `/v1/key` independently reported `invocation_allowed=false`; discovery returned 200, model invocation returned 403 `invocation_not_authorized`, and Provider administration returned 401. Revocation made discovery return 401. Earlier denial-path evidence remains valid. |
| Complete a tool round trip | A real model request returned `verify_release` with exact version `0.3` and marker `CURRENT_INPUT_20261117`, ending with `tool_calls`. Parsed and checked the arguments, returned the tool result, and received `TOOL_READY`. Independent request records matched 151/25 and 192/6 tokens, the corresponding finish reasons, and zero customer charges. |
| Store and recover binary media | Uploaded a current browser screenshot through the workspace asset API. Downloaded 96,428 bytes and independently matched SHA-256 `3963985249c1e7265ee469aaa2ca40e7bdd94a4003c0ac521d75375beb985d1b`. Another workspace returned 404 for that asset. Deleted the created asset and independently read 404. This verifies local asset storage, not generated video. |
| Install, upgrade and recover a container | Started v0.2.26 with isolated PostgreSQL, created organization/workspace/key records through HTTP and authenticated the key. Made a real PostgreSQL backup, upgraded the same database to the built candidate, then restored a post-upgrade dump into a separate database. Original identities, names and key authentication survived both upgrade and restore; key listings did not disclose the secret. Migration receipts advanced from 389 to 436. A separate clean database accepted onboarding and served `/workspaces` with HTTP 200. Container UID was 10001. |
| Run native inference and account for a positive charge | Configured an isolated resale installation with explicit zero-cost upstream bounds, a customer tariff of 1,000,000/2,000,000 nanounits per million input/output tokens and a minimum charge of 10,000 nanounits. A real upstream request returned `NATIVE_READY`. Independent SQL showed `confirmed_completed`, `provider_reported`, 11/35 tokens, funding +1,000,000,000 and charge −10,000. The expected rounded token charge was 81 nanounits, so the 10,000 minimum applied. The upstream staging record independently matched 11/35 and zero upstream customer charge. Restart preserved key authentication. |
| Enforce distinct actor scopes | In that native installation, a separate organization's owner received 404 for reading and creating keys in the test workspace, and 403 for Provider administration. A workspace viewer could list keys (200), could not create one (403), and could not read Provider administration (403). Earlier inference-key and chat-scope checks remain in the API record. |
| Prepare a payment without premature credit | Current native EPay checkout created a real persisted pending order and a signed checkout URL. Independently recomputed the URL signature, checked idempotent replay and restart, denied signing-credential rotation while an order remained pending, and verified role boundaries. Database readback contained one order, zero settlements and zero balance entries. Disabling checkout retained credentials and the existing order; re-enabled checkout replayed correctly. No merchant transaction or settlement was performed. |
| Revoke and clean up | Revoked the four credentials created in this browser/quote/agent pass; independently observed 401 for the UI and agent credentials. Deleted the created conversation and asset, preserving request/audit records. Both browser and HTTP sessions were signed out. Isolated databases/containers were removed. |

The earlier published MCP consumer, streaming, short-output boundary, stale-revision rejection and source-checksum observations are linked above rather than repeated as new runs.

## Reproduced release blockers

| Finding | Trigger, consequence and evidence boundary | Tracking |
| --- | --- | --- |
| Fresh key is falsely rejected by Generations | Create a key, then choose Open Generations in the success Dialog. The named key is selected, but the composer declares it invalid and disables Send. Independent key/model reads succeed. Reload is a working recovery. Source inspection identifies a likely cause: `keyChoices` deduplicates the freshly issued session key ahead of workspace metadata, losing the slug used by `requestedKeyMissing`. The observed behavior, not that inference alone, establishes the defect. | `niu-zhlk` |
| Public prebuilt image cannot be retrieved | The downloaded v0.3.0 `compose.yaml` and `install.sh` point to `ghcr.io/niu-io/niu:v0.3.0`. A fresh, unauthenticated GHCR token request for repository pull access returned 403 `DENIED`; manifest inspection also failed. This does not establish whether the package is private or missing. Later source inspection confirmed that the installer can fall back to a source build, so this observation does not prove that every installation path fails. A locally built image cannot substitute for the public image distribution gate. | `niu-gzpa` |
| Published source and release tag disagree | Published `SOURCE_COMMIT` is `d8f3cfa194ea79fd4f3a8b073bf935bcf6368e1a`; the rechecked remote lightweight v0.3.0 tag is `bf0fca4d58fce2b5fade5c297b61fcc4844c12ea`. Downloaded bundle checksums matched their manifest, which does not resolve the source mismatch. | `niu-16wj` |
| Current video routes lack an effective estimator | Fresh estimates for all three discoverable video routes—Wan 3.0, Seedance 2.5 and Seedance 2 Mini—returned 501 `unsupported_operation_error`, stating that no effective video output estimator is configured. The browser Estimate action reproduced this. These are owner-funded routes; a Niu zero allowance cannot bound Provider expense. No paid generation was dispatched. This is a deployed configuration/qualification gap, not proof that every video adapter fails. | `niu-pfsr` |

The fresh-key finding violates the expected task continuation and recognizable recovery behavior in the UX review method ([task walkthroughs](https://www.nngroup.com/articles/cognitive-walkthroughs/), [error prevention and recovery heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)). The report makes no claim of measured human usability from agent-operated checks.

## Acceptance boundary

The release decision is **blocked by observed failures**, not delegated to the operator for manual verification. Positive-charge accounting is established for an isolated native installation using real free upstream inference; live merchant settlement is not. Video execution, generated-media integrity and uncertain paid-job recovery cannot be qualified from estimate failures or old saved jobs. Configure and qualify those routes under explicit bounded spending authority before accepting that branch.

This review also does not certify sustained production reliability, every integration/protocol, every administrative workflow, or all role/resource combinations. The current release gate still requires exact-tip CI and staging acceptance after repairs. Keep `niu-nrcn` open until its retained acceptance scope is met; publish a coherent immutable patch candidate instead of moving the existing tag.

## Payment configuration reinspection — 2026-11-18

A read-only inspection of the two authorized running Niu deployments checked
both service environment configuration and the platform's persisted settings.
The environment responses were complete within their requested page limits.
Neither supplied a native EPay, Zhifux or Stripe merchant configuration through
environment settings. Persisted EPay settings were disabled and had no merchant,
key or endpoint. The platform configuration reported EPay and Zhifux checkout
disabled; the mock-payment control endpoint independently returned available and
enabled for both deployments.

Stripe-shaped checkout readiness in this configuration therefore does not prove
real payment settlement. Account verification remained absent and callback
verification false. This inspection did not locate an existing reusable real
merchant configuration; it does not assert that no merchant account exists
elsewhere. No configuration, checkout, order or payment was changed or created.
Service identifiers and raw administrative responses remain in the private
verification archive. `niu-nrcn.6` retains the real-checkout/settlement requirement
and the outstanding operator configuration/authority dependency. Fixture results
were not used.

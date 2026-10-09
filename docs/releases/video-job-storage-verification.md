# Video job storage checkpoint

Partial V05/V20 foundation. No video endpoint or release gate is qualified.

Migration 0115 adds immutable, workspace-scoped upstream job bindings and append-only normalized status evidence. The internal Store requires a dispatched attempt before binding; identical binding retries succeed, while a different upstream reference or schema revision is rejected. Upstream references have no customer response serializer.

Repeated query statuses deduplicate. Running outranks queued; known terminal success or failure outranks late nonterminal observations. Opposing terminal observations yield Conflicting, rather than overwriting history. Unknown evidence remains unresolved until terminal evidence arrives. This reducer neither submits generation nor updates attempt execution, settles charges, releases reservations or infers refunds.

Two fresh PostgreSQL tests verify durable retrieval, same-company workspace and foreign-company isolation, immutability, concurrent competing bindings, duplicate concurrent observations and out-of-order/contradictory status handling. The complete fresh PostgreSQL storage run passed 125 tests across 23 groups through migration 0115, with ignored database cases enabled. Clippy with warnings denied, the locked gateway build check and public-boundary checks passed. No paid requests were made.

[Recovery identity storage](video-recovery-route-verification.md) now adds pinned route identity and upstream-job uniqueness. Still required: authenticated adapters, complete bounded response evidence and timing, polling/backoff/restart workers, result retention, public authorization/API/SDK, safe transitions into accounting, and real query/callback qualification. This status set is not a full event trace; it does not measure queue/run duration. Unknown submission without a returned upstream reference remains an unresolved attempt, never permission to resubmit.

## Completion and settlement integration

Migration 0118 serializes normalized status insertion with the attempt lock used by completion and settlement. The database rejects generic completion of a bound video job without unopposed success. `confirm_media_job_completion` is idempotent and preserves the first completion timestamp; success alone does not establish billable usage.

Before a new debit, media settlement checks the bound job's current evidence again. A contradictory failure before settlement leaves the job unresolved and its reservation held. A late contradiction after settlement remains visible without rewriting the immutable debit; adjustment policy and explicit reconciliation are still required. Failure does not establish nonexecution or authorize a refund.

The integrated synthetic test covers success without usage, generic completion bypass rejection, concurrent failure/completion, one exact debit, held conflicting liability and an idempotent retry after a late conflict. This is internal accounting integration, not a qualified video endpoint. See the [request schema checkpoint](video-request-schema-verification.md) and [recovery identity checkpoint](video-recovery-route-verification.md) for their narrower evidence.

Fresh verification through migration 0118 passed 129 storage tests across 23 groups, including the five job tests and existing media/balance regressions, with ignored PostgreSQL cases enabled. Clippy with warnings denied, the locked gateway build check and public-boundary checks also passed.

## Query decoder checkpoint

Added a bounded direct-envelope decoder checking the expected upstream job and model. It distinguishes terminal reported usage, missing/invalid quantities and explicit zero; nonterminal counts are not billable actuals. Unknown and unqualified cancellation statuses remain unresolved. Result URLs are syntactically checked and held in non-serializable internal objects; upstream error messages are omitted. Missing output availability does not imply zero charge. Optional provider timestamps are separate from measured queue/run performance.

The [official SDK query model](https://github.com/volcengine/volcengine-go-sdk/blob/master/service/arkruntime/model/content_generation.go) supplied the structural reference; this does not qualify a forwarding channel, usage unit or output URL lifetime. Wrapped channel envelopes, network authentication and atomic application to a scoped job remain open. No raw response or private media link enters ordinary customer serialization through this module.

All eleven media tests passed (four query-decoder tests plus seven request-schema tests), as did Clippy with warnings denied and the locked gateway build check. No storage migration or UI changed in this decoder checkpoint. No live video request was sent.

## Query transport checkpoint

Moved the gateway's existing DNS-checked, redirect-disabled connection pool into `niu-upstream`, retaining gateway use through its existing module boundary. Media query transport now shares that policy. A single GET validates protocol configuration before dispatch, bounds total time and response size, and returns safe status/timeout errors without upstream error bodies. It neither retries generation nor automatically changes storage or billing.

Fifteen media/shared-transport tests passed, including declared-length and chunked-size bounds, redirect denial, timeout classification, invalid configuration with zero dispatch, private-address denial and pooled connection reuse. This is reusable transport tested against a local HTTP fixture; live qualification, scoped route integration and restart polling remain open.

The gateway regression run passed 104 enabled tests; 95 PostgreSQL-dependent cases remained ignored, so this run does not qualify those workflows. Clippy across gateway/media/shared-transport targets, public-boundary checks and retained upstream attribution/checksum verification passed. No live video request was sent.

## One-shot create transport checkpoint — 2026-10-06

The media crate now provides `submission::submit_job` alongside query transport. It accepts schema-validated requests, preserves the mapped upstream model, uses the shared endpoint policy, bounds credentials/deadlines/response bytes, and returns an internal job-reference receipt without Debug/Serialize. Configuration and endpoint failures are pre-dispatch; HTTP errors, timeouts and unusable responses after POST remain uncertain. No automatic retry, fallback, nonexecution claim or refund is inferred.

Fresh `cargo test -p niu-media` passed all 13 tests, including an actual local HTTP fixture verifying one POST per success/error/malformed/oversized/timeout case and zero POST for invalid configuration. `cargo clippy -p niu-media --all-targets -- -D warnings` passed. These are transport fixtures, not a live channel qualification or gateway workflow: atomic admission, durable receipt persistence, public APIs, recovery workers and full V02/V20 acceptance remain open.

## Uncertain submission storage checkpoint — 2026-10-06

Migration 0120 adds immutable, workspace-scoped submission-uncertainty evidence tied to a pinned recovery route. Both the storage method and database insert guard require a dispatched attempt. Duplicate observations retain one record; another workspace cannot read or write the condition. A later immutable upstream binding resolves the unresolved-reference condition while preserving original evidence. These methods do not modify holds, charges or dispatch state.

All six PostgreSQL media-job tests passed against a fresh database, including reconstruction of the Store, unsent/direct-SQL rejection, cross-workspace isolation, duplicate handling, immutable evidence and later binding. This verifies durable storage, not process-restart recovery or gateway integration. Public-boundary checks passed for 1,127 files. Uncertain submissions without references still require qualified reconciliation; this checkpoint does not provide a queryable upstream ID or authorize a replacement POST.

## Dispatch route recheck — 2026-10-06

Migration 0121 revalidates pinned video route identity when an attempt transitions from not-sent to may-have-executed. It locks the credential and model, rejects changed revisions, mappings, schema, endpoint/adapter, disabled routes or changed personal ownership. It does not replace existing key, policy or financial admission checks. An immutable pin cannot silently be refreshed onto another account.

Seven fresh PostgreSQL media-job tests passed, including a route revision change between pinning and dispatch: dispatch intent remained unsent and uncertainty recording was denied. Storage all-target Clippy passed. Submission transport also now shares one absolute deadline across endpoint resolution, POST and response reading; its HTTP regression fixture passed again. Gateway wiring, live channel qualification and complete concurrent admission/recovery acceptance remain open.

## Recovery discovery checkpoint — 2026-10-06

The storage API now supports bounded, workspace-scoped keyset sweeps of durable video dispatch intent. Discovery does not depend on an uncertainty marker, so a crash between dispatch and marker/reference persistence remains visible. Candidates distinguish presence of an upstream reference without exposing credentials. Completed unpriced jobs leave the queue; completed customer-priced jobs remain until their immutable charge exists. Start another sweep after reaching the end to discover concurrent admissions sorting before the cursor. Discovery does not claim a lease, authorize query transport or permit a replacement POST.

The prior dispatch-trigger revision passed all 131 storage tests across 23 suites against fresh PostgreSQL, with zero failures or ignored cases. The recovery-discovery change separately passed all seven media-job tests, including marker-free discovery, workspace isolation, cursor/limit boundaries and completed-job removal; all-target storage Clippy passed. A running recovery worker, process-restart qualification and gateway creation/query integration remain open.

## Decoded query application — 2026-10-07

Decoded observations now retain private upstream job/model identity. `apply_media_query_observation` checks both against the scoped durable binding before recording status or customer usage. It confirms completion only from aggregate unopposed success, then invokes existing atomic pinned-tariff settlement only for a current reported quantity with agreed durable usage. Missing/invalid quantities cannot settle using older observations. Conflicting status/usage remains unresolved; errors never create refunds. Duplicate application reuses the original charge. Private result URLs are not persisted or serialized by this path.

Seven fresh PostgreSQL media-job tests passed, including wrong-job rejection, missing/invalid-usage nonsettlement and duplicate query application producing the same 20-nano fixture charge. Media/storage all-target Clippy passed before the final additional assertion cases. Caller duties remain explicit: authenticated transport and protocol/meter qualification are required. The gateway route, polling worker, result persistence and live Provider acceptance remain unfinished.

## Authenticated durable status API — 2026-10-07

`GET /v1/video/jobs/{id}` reads scoped saved state using a current workspace API key and original-model permission. It exposes only the Niu reference, object category, public model and normalized status. A missing upstream binding returns `submission_unknown`; conflicting terminal evidence returns `reconciliation_required`. There is no upstream call, new generation, settlement or result/procurement serialization on this read path. See [API boundary](../reference/video-jobs.md).

A fresh PostgreSQL-backed gateway HTTP test passed with an actual pinned/dispatched fixture, missing/invalid authentication, inaccessible reference, restored saved status and revoked key. Gateway tests type-check and gateway all-target Clippy passed. This subset does not qualify create/query transport integration, live models, result retrieval or the polling worker.

## Public client and isolation checkpoint — 2026-10-07

The OpenAPI contract and public JavaScript client now cover persisted job retrieval, with explicit unknown/reconciliation states and unsupported creation/polling/result boundaries. `video.jobs.retrieve` validates a Niu reference, preserves standard credentials and AbortSignal, and makes a single GET. All 114 JavaScript SDK tests passed. The expanded fresh PostgreSQL gateway HTTP test passed with cross-workspace and model-grant denial returning 404, alongside current-key, missing-job, persisted-state and revocation checks. These checks do not qualify a completed video workflow or live Provider operation.

## Gateway capability integration checkpoint — 2026-10-07

The gateway's strict Supplier capability parser previously rejected the storage-supported `video_schema` field. It now validates configured video schemas and their upstream mappings while allowing catalog composition. Both shared and owner-funded text route resolution explicitly reject video-only mappings before credentials/dispatch, avoiding accidental Chat, Responses or Embeddings generation. This does not establish a dedicated video create path or live entitlement.

A parser regression test passed for valid schema acceptance, invalid bounds and mismatched upstream mappings. The fresh PostgreSQL gateway HTTP test passed with all three text endpoints returning unsupported-operation errors and no new dispatch attempts, in addition to job-read authorization/isolation checks. Gateway all-target Clippy passed. Catalog UI/modalities and complete Supplier onboarding still require their own rendered acceptance.

## Owner-funded create path — 2026-10-07

`POST /v1/video/jobs` now implements the initial configured `ark-direct-v1` text-only personal route. It validates schema/controls, current model grants and policy access before pinning the personal route and video recovery identity, binding Guardrail inspection evidence and committing dispatch intent. It sends one bounded POST; accepted receipts bind the upstream job. Unusable responses or failed receipt persistence preserve the Niu reference with submission_unknown. Durable intent remains discoverable if the uncertainty marker cannot be written. Active content-inspection requirements fail closed; media references, callbacks, other channels and customer-funded generation are explicitly unsupported pending their required integrations.

Two fresh PostgreSQL gateway HTTP tests passed: owner-funded success/uncertainty each produce one authenticated upstream POST with the mapped model; customer account bindings remain absent; read authorization, workspace/model isolation, revocation and generic-text-endpoint rejection remain covered. All 115 JavaScript SDK tests passed with matching create/retrieve calls and no automatic retry. Gateway all-target Clippy and contract parsing/auth-scheme checks passed. Tests use local upstream fixtures, not live video generation or model entitlement. No F03/F04/F05 gate closes; paid media admission, polling/restart workers, results, full Guardrails and V01–V21/M01–M08 acceptance remain open.

## Explicit original-route refresh — 2026-10-07

`POST /v1/video/jobs/{id}/refresh` connects owner-funded direct query transport to durable status/completion application. Recovery retains the original credential account and revision-checked model/channel. Current key/workspace/model and model/Provider policy access are checked before egress. The private upstream reference is encoded as one URL path segment. One bounded GET is performed; missing references or changed/disabled routes cannot create a replacement generation. The response excludes private result URLs and procurement data. Automatic workers/backoff, result persistence and live qualification remain open.

Both fresh PostgreSQL gateway HTTP tests passed. The local create/query fixture verifies two explicit refreshes on the original job reach success without additional generation POSTs or customer account bindings; missing-reference refreshes return conflict without GET. All 116 SDK tests passed, including explicit refresh errors without creation retry. Gateway all-target Clippy and OpenAPI parsing/auth-scheme checks passed. These checks cover the initial owner-funded text subset, not all channels, customer-funded settlement or production video acceptance.

## Content-free query evidence — 2026-10-07

Migration 0122 retains immutable scoped query metadata independently of commercial pricing. Receipts include normalized status, explicit reported/missing/invalid quantity, configured protocol/meter revision and reported/missing/invalid Provider timestamps. Integer quantities/timestamps use decimal strings to preserve exact values across JavaScript boundaries. Provider times do not establish measured queue/run or gateway spans. Upstream IDs, private URLs, raw errors and media contents are excluded. Identical metadata deduplicates by digest; customer settlement retains its separate provenance and pricing rules.

Two fresh PostgreSQL gateway HTTP tests and seven media-job storage tests passed. Repeated owner-funded refreshes preserve one 200000-unit receipt with missing timestamps and no private result data. Media/storage/gateway Clippy passed. The media test suite additionally checks u64-max quantity preservation and metadata privacy. This checkpoint does not complete historical UI, measured timing waterfalls, retention/deletion, live meter qualification or result handling.

## Measured transport timing — 2026-10-07

Migration 0123 stores immutable, scoped submission/query network spans with Unix start milliseconds, monotonic elapsed milliseconds and received/unavailable transport outcome. The dispatch guard rejects unsent attempts. Collection excludes subsequent database reconciliation and never equates request latency with Provider queue/run time. Failed observation persistence is logged and leaves a gap rather than inventing duration or changing generation outcome.

`GET /v1/video/jobs/{id}/timings` and SDK `video.jobs.timings` expose only phase/start/elapsed/outcome, enforcing current key/workspace/model access. The latest 100 spans are chronological with explicit has_more; internal span IDs, upstream identity and procurement data are excluded.

Two fresh PostgreSQL gateway tests passed with delayed actual upstream transport, successful/uncertain submissions and repeated queries. Seven media-job storage tests passed, including a 101-span fixture checking ordering, truncation, model denial and immutable records. All 117 SDK tests, gateway all-target Clippy and timing-contract parsing/auth checks passed. The rendering/waterfall, complete queue/run semantics, automatic polling, live channels and full performance qualification remain open.

## Opt-in leased query recovery — 2026-10-07

Migration 0124 adds operational query scheduling separately from immutable job/accounting evidence. Restart discovery admits at most 100 new existing owner-funded direct jobs per tick, excluding missing references. Row leases coordinate replicas for 90 seconds; expired owners cannot overwrite a replacement worker. Normal progress waits ten seconds, failures back off up to five minutes, and terminal observations stop scheduling. The initial worker processes one job at a time, rechecks the original key/model/policy/route through the same refresh path, and never submits generation. Revoked/expired keys stop. `NIU_VIDEO_POLLING=true` opts in; default is false. Scheduling metadata is internal and does not redefine generation state or refund rules.

Two fresh PostgreSQL gateway tests passed on the final bounded-discovery implementation. The fixture reconstructs server storage, discovers a bound job, queries success and stops; uncertainty without a reference never polls. Concurrent claim, lease expiry/replacement, stale completion rejection and failure backoff are checked. Existing generation/query count, customer-account separation, query evidence and measured timing assertions remain green. Gateway tests type-check and gateway all-target Clippy passed for the worker implementation. Actual process termination, packaged restart, long-running/rate-limit performance and live Provider qualification remain open; this does not close F04/V05.

## Native video process replacement — 2026-10-07

The PostgreSQL integration test `video_polling_survives_process_replacement_without_resubmission` starts the actual gateway binary, creates an owner-funded text-input video job through HTTP, stops that process, and starts a replacement with the same database and encryption configuration and opt-in polling enabled. The replacement discovers the saved job and queries its original upstream account without submitting generation again. The fixture records exactly one creation and one recovery query, one immutable query receipt, a stopped terminal polling schedule, and a customer response without upstream identity or result URLs. The replacement receives no bootstrap Supplier credential.

Fresh acceptance: `cargo test -p niu-gateway --test vendor_restart video_polling_survives_process_replacement_without_resubmission -- --include-ignored --test-threads=1` passed against isolated PostgreSQL (one test). This proves native process replacement for the current owner-funded route using a local upstream fixture. It does not qualify customer-funded video, live Provider contracts, lost submission receipts, media retrieval, container restart/restore/upgrade, or the complete V05/F01 gates.

## Recovery authorization and current storage regression — 2026-10-07

The native process-replacement fixture now also revokes the original workspace API key before replacing the gateway. The replacement discovers the saved job but stops its polling schedule without an upstream query or another generation submission. Saved job evidence remains unknown; a customer read using the revoked key returns 401. Revocation does not turn unresolved generation into failure, completion or a refund.

Fresh acceptance: `cargo test -p niu-gateway --test vendor_restart video_polling_ -- --include-ignored --test-threads=1` passed both process-replacement tests. `cargo test -p niu-storage --tests -- --include-ignored --test-threads=1` passed all 131 tests across 23 suites against fresh isolated PostgreSQL through migration 0124, with no failures or ignored tests. This includes media identity, pricing, shared reservations, settlement, Supplier credential/model subsets and account isolation. These results qualify the tested backend mechanisms only. Authoritative customer video tariff/liability configuration, gateway commercial dispatch integration, live channels, media/result workflows and packaged release acceptance remain required.

## Durable customer video rate selection — 2026-10-07

Migration 0125 adds immutable customer selling schedules, separately from Supplier procurement terms. The internal registration API stores a versioned tariff, discount rules, exact credential/model/schema revisions, offer revision and qualified maximum quantity. Selection requires one effective customer/dimension match and a current enabled commercial credential/model/schema. Missing schedules return unavailable; overlapping schedules, stale mappings and personal owner-funded credentials fail closed. Selected pricing and liability remain separate from job submission and settlement.

Fresh isolated PostgreSQL acceptance: `cargo test -p niu-storage --test media_rates -- --include-ignored --test-threads=1` passed four tests covering exact registration retries, changed-revision rejection, effective-period boundaries, customer and dimension isolation, reconstruction from a new Store, ambiguous rates, database update/delete protection, stale model revisions, personal credentials, invalid zero quantity bounds, promotion-period boundaries and independent resolution tariffs. The earlier 131-test full storage regression covered migration 0124; it is not a full regression claim for 0125. Authorized administration/API setup, request-dimension selection, commercial offer qualification and gateway prepaid video integration remain required.

## Authorized rate publication API and SDK — 2026-10-07

Installation administrators can publish customer video selling schedules through `POST /admin/v1/organizations/{organization}/billing/media-rates`. Existing write authorization is required; company owner/admin/viewer roles and workspace inference keys cannot write this configuration. The endpoint bounds JSON to 128 KiB, delegates exact/current-route validation to storage, and returns only the selling revision. Identical current configuration replays succeed; altered content under a published revision returns 409. No upstream generation, reservation or charge follows from publication.

The JavaScript SDK exports the typed rate card, exact rational quantity and billing dimensions, with `publishCustomerMediaRate` carrying cancellation and making one request without automatic retries. It rejects unsafe JavaScript integers and omits unknown outer fields. The billing OpenAPI contract includes the endpoint, complete request fields, permissions and failure boundaries; it parses and all local references resolve.

Fresh acceptance: the three gateway video tests passed against isolated PostgreSQL through migration 0125, including publication permission/immutability plus existing owner-funded dispatch/status tests. All 118 JavaScript SDK tests passed. These are subset checks, not full gateway or release qualification. Commercial offer/upper-bound evidence, administration UX, customer-funded request dimension selection and prepaid video dispatch integration remain open.

## Prepaid text-video dispatch and explicit settlement — 2026-10-07

Customer-funded `ark-direct-v1` text submission now selects an effective customer selling schedule using the validated effective resolution. It requires an enabled commercial route, the original credential/model/schema revisions and a real current qualified Supplier offer whose revision matches the selling snapshot. Legacy routes without offers cannot bypass this requirement. Personal ownership remains a separate accounting mode.

Before one upstream POST, the gateway binds the original offer and customer pricing, pins and verifies the recovery route, binds inspected access policy and reserves the qualified maximum customer liability. The existing dispatch boundary rechecks key, policy, offer and route state. Failed pre-dispatch admission releases a hold only if storage can confirm nonexecution. Uncertain generation retains its hold and Niu recovery reference without an automatic retry. Explicit query refresh applies successful reported usage through the existing exact, idempotent customer settlement path; procurement token rates never replace the customer selling price.

The PostgreSQL/local-upstream fixture verifies zero-funded rejection with zero generation POSTs, schema-default resolution forwarding, a 20-nanounit reservation, one 10-nanounit customer debit after two identical successful queries, and a second uncertain generation retaining its 20-nanounit hold. Another request is rejected for insufficient available funds without an additional POST. The synthetic Supplier qualification and liability references exercise mechanism enforcement; they are not commercial or live-channel evidence.

A separate storage fixture changes the model revision between resolution and pinning, proving the old resolved context cannot authorize the new pin. It also checks foreign scope and a subsequent revision change at the database dispatch boundary. Fresh acceptance: all four gateway video tests and all eight media-job storage tests passed against isolated PostgreSQL through migration 0125; gateway Clippy with all targets and warnings denied passed. This is not a fresh full gateway/storage regression.

Customer-funded automatic polling, video workspace-budget reservations, live contract/upper-bound qualification, failed-job financial reconciliation, Supplier media procurement/earnings, charge explanation UI, media inputs/results and the complete Video/Logs/Usage/Billing workflow remain required. Workspaces with active budgets fail closed until the video budget path is implemented. The current worker still discovers owner-funded jobs only; commercial jobs require explicit refresh.

## Prepaid automatic recovery and local ledger retry — 2026-10-07

The opt-in worker now discovers bound personal and prepaid direct-channel jobs. Its bounded discovery includes completed customer jobs whose liability has not posted. Successful generation with missing usage does not stop prepaid recovery: the hold remains and polling backs off. Failed/conflicting generation stops queries without inventing a refund. Missing upstream references are never resubmitted.

When original success, agreed reported usage and pinned customer pricing are already saved, recovery retries the authoritative settlement transaction locally. It does not query upstream again or change tariffs. Key revocation blocks future queries and customer reads, while an already evidenced committed financial obligation can still reconcile without egress. Leases, exact debit idempotency, account capacity and original scope remain enforced.

The gateway fixture proves the reservation and dispatch intent exist when the upstream POST arrives. It then observes success without usage, retains the hold and nonterminal scheduling, reconstructs a deliberately removed operational schedule from durable completed-job data, and receives reported usage. A synthetic debit-trigger failure rolls back the ledger write while preserving job/usage evidence. After removing that fault and revoking the original key, a reconstructed worker posts the original charge once with no new query or generation; revoked-key reads return 401. A replacement workspace key can explicitly refresh the same job, and duplicate queries do not debit again. Uncertain creation still retains its separate hold and prevents overspending.

Fresh acceptance: all four gateway video tests passed; both actual gateway process-replacement video tests passed for the existing owner-funded path; gateway Clippy with all targets and warnings denied passed. The prepaid test reconstructs application/storage state and injects a storage fault; it does not prove prepaid binary process replacement or packaged recovery. Live channels, complete failure/refund rules, Supplier media accounting, workspace video budgets, results, media safety and complete customer workflows remain open.

## Native prepaid process replacement — 2026-10-07

The real gateway binary process-replacement fixture now covers prepaid video. It publishes the customer selling card through the installation-authorized HTTP API, funds an isolated CNY company account, and submits one text-input job through the workspace API key. The first gateway is stopped before any query. A replacement starts with the same database and encryption configuration, no bootstrap Supplier credentials, and opt-in recovery enabled. It queries the original saved job once, posts one exact 20-nanounit customer debit, releases the original reservation and stops polling. Generation submission remains exactly one; the authoritative account balance is 20 nanounits after its synthetic 40-nanounit funding.

The negative prepaid variant revokes the original key before process replacement. The replacement sends no upstream query, posts no invented debit and retains the 20-nanounit reservation for the still-unknown original job. Existing owner-funded restart and revoked-key variants remain passing.

Fresh acceptance: `cargo test -p niu-gateway --test vendor_restart video_polling_ -- --include-ignored --test-threads=1` passed all four native process-replacement video tests against isolated PostgreSQL through migration 0125. This proves the tested prepaid restart mechanism using a local upstream and synthetic commercial qualification. It does not qualify real supply rights, live video channels, binary recovery after a ledger-write failure, packaged restore/upgrade, media results, complete financial rules or the full F01/F05 gates.


## Customer-safe saved video billing — 2026-10-07

`GET /v1/video/jobs/{id}/billing` and `client.video.jobs.billing(id)` now expose saved customer accounting with current workspace/model authorization. The read performs no upstream request or settlement. One database snapshot supplies the immutable selling price, agreed reported usage, active reservation and posted customer charge. Exact monetary and quantity values are decimal strings. Missing usage, unposted settlement, contradictory observations and liability-bound breaches stay distinguishable; owner-funded personal jobs return null Niu customer amounts instead of an invented zero charge.

The prepaid gateway fixture verifies reserved → awaiting_usage → awaiting_settlement → settled across a synthetic ledger failure and local recovery. It checks the customer tariff rather than Supplier purchase pricing, withholding the charge until posted and releasing the reservation after settlement. Scope/model denial and owner-funded null amounts are also tested. The customer projection excludes internal revision/ownership identifiers, procurement terms, credentials and private URLs.

Fresh verification: all four gateway video tests passed against isolated PostgreSQL through migration 0125; all 119 JavaScript SDK tests passed; gateway Clippy with all targets and warnings denied passed. The OpenAPI document parsed with all 80 local references resolving; public-boundary checks passed over 1,141 files. This qualifies the tested backend/SDK subset only. Customer Video/Logs/Usage/Billing UI integration, live channel qualification, workspace video budgets, full financial rules and the release gates remain open.


## Immutable customer media rate retirement — 2026-10-07

Migration 0126 adds append-only retirement cutoffs for published customer media selling schedules. Selection excludes an original card at its cutoff without modifying the card or pinned job prices. Installation-authorized HTTP and SDK writes support exact idempotent replay; changed cutoffs conflict. Missing replacements and remaining overlaps fail closed. This is customer selling configuration, not Supplier procurement pricing or commercial qualification.

Six storage rate tests passed against isolated PostgreSQL, including exact cutoff selection, open-ended replacement, scope isolation, original-document preservation, direct database mutation/invalid-boundary denial, competing cutoff writes and reconstructed historical charge calculation (old price 10 units versus replacement price 20 for identical synthetic reported usage). Four gateway video tests passed through migration 0126, including denied company-member/inference-key retirement, accepted installation writes and replay/conflict/invalid-cutoff responses. All 120 JavaScript SDK tests passed, including scoped encoded revision paths, safe timestamps, cancellation and no automatic mutation retry. Gateway Clippy with all targets and warnings denied passed. Billing OpenAPI parsed with 60 local references resolving; public-boundary checks passed over 1,142 files.

These checks establish the tested backend/SDK lifecycle. Supplier pricing administration UI, confidential media procurement/settlements, live qualified tariffs, packaged migration/recovery and full F03/F05 acceptance remain open.


## Independent Supplier media earnings and settlement — 2026-10-07

Migration 0127 adds confidential agreed Supplier media purchase cards and immutable attempt pricing, separate from customer selling cards. Installation write authorization publishes purchase terms through HTTP and the JavaScript SDK. Exact publication replay is idempotent; changed revisions, foreign Supplier offers, stale route/schema identities, ambiguous or differently metered selection fail closed. Commercial video binds an eligible purchase snapshot before dispatch; an unpriced Supplier cannot send a paid generation. Personal owner-funded routes remain outside this accounting path.

Successful agreed reported media usage accrues one Supplier obligation from the original purchase terms independently of customer payment. The shared Supplier earnings/confirmed-payment ledger now supports media meter quantities with null text-token categories. Database triggers prevent mutation, mismatched Supplier binding, post-dispatch price binding and text/media earning crossover. Supplier media consumption is grouped separately from text and restricted by the existing Supplier membership boundary; customer billing reads never query purchase snapshots or earnings. Existing settlement isolation, currency checks and exact replay apply to media earnings.

The prepaid gateway fixture verifies a synthetic 4-nanounit Supplier earning despite an injected customer-debit failure, then a separate 10-nanounit customer debit. Duplicate queries do not accrue again; replaying the same confirmed external payment is idempotent, a foreign Supplier cannot settle the entry, and its dashboard has no corresponding consumption. Missing purchase pricing, denied company/inference-key publication, immutable purchase snapshots and text-earning crossover are exercised. These prices and payment references are test inputs, not live price or discount claims.

Fresh verification: all 138 storage tests across 24 suites passed through migration 0127, including existing text earnings/settlements; all four gateway video tests passed; all four native process-replacement video tests passed. Native prepaid recovery preserves one generation/one query and posts an 8-nanounit Supplier earning independently from its 20-nanounit customer charge; revoked recovery sends no new query or invented debit. All 121 JavaScript SDK tests passed. Gateway Clippy with all targets and warnings denied passed. All 321 checked OpenAPI references across five documents resolved; public-boundary checks passed over 1,145 files.

This establishes the tested backend/SDK accounting and native recovery subset. Complete purchase-rate lifecycle and administration UI, Supplier-facing media presentation, qualified live agreements/rates, failure/refund adjustments, customer Video/Logs/Usage/Billing, packaged recovery and the full F03/F05/F07 release gates remain open.


## Supplier media purchase history and retirement — 2026-10-07

Migration 0128 adds immutable Supplier purchase-card retirement cutoffs. Existing publication dates not previously recorded remain null; new publications record their actual database timestamp. Retirement ends eligibility without rewriting purchase documents, historical attempt prices, Supplier earnings or customer charges. Exact replay creates one retirement/audit event; competing different cutoffs serialize and one conflicts. Missing/overlapping eligible cards still fail closed.

The paginated purchase-history API permits installation readers and active members of the exact Supplier. Company roles without membership, inference keys and foreign Supplier membership cannot read procurement history. Publication/retirement remains installation-write-only. Read amounts, route revisions and effective times are exact strings; pagination has a maximum of 100 cards and an explicit continuation. The SDK exposes matching list and retirement methods without automatic mutation retries.

Fresh acceptance: all four gateway video tests passed against isolated PostgreSQL through migration 0128. The prepaid fixture tests overlap denial, cutoff boundaries, competing writes, immutable retirement, exact replay/audit, pagination, company/key/member authorization and Supplier isolation. The original job remains priced at purchase amount 40 and accrues 4 nanounits even after a replacement amount 80 is active; a new boundary attempt pins 80. Its separate customer charge stays 10 nanounits. Both Store validation and direct database insertion reject cutoffs outside the original interval.

All 122 JavaScript SDK tests passed; gateway Clippy with all targets and warnings denied passed. All 336 checked OpenAPI references across five documents resolved; public-boundary checks passed over 1,146 files. The complete storage regression and native restart evidence in the preceding checkpoint cover migration 0127, not a fresh full-suite run through 0128. Full dashboard price management, live Supplier qualification, packaged migration/recovery and the F03/F05/F07 gates remain open.

## Current gateway/database regression — 2026-10-07

The current gateway passed all five PostgreSQL-backed video tests on a freshly
initialized isolated database. Tests cover dashboard/direct prepaid admission and
single settlement, personal dispatch without retrying uncertain submissions,
current scoped model authorization and installation-only selling administration.
Their local transport fixtures exercise original-route recovery, revoked-key
handling and retained historical billing. The isolated database was stopped after
testing; no development data or Supplier credential changed. This confirms the
tested local paths, not live Provider, process/container or complete video release
acceptance. Public-boundary and scoped whitespace checks passed.

### Current durable job/pricing regression

On a fresh isolated PostgreSQL instance, all 12 media job tests and 14 media pricing
tests passed. Coverage includes concurrent binding/reservations, original-account
and route pinning, Store reconstruction, lifecycle conflicts, result expiry and
non-resurrection, immutable output/pricing, exact settlement, unresolved liability
and cross-job capacity isolation. The helper stopped the database on completion.
This supplements the five gateway tests above; it does not prove process/container
restore or authorized live Supplier behavior. Public-boundary and scoped whitespace
checks passed. Complete release gates remain open.

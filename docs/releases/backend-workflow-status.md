# Backend workflow verification status

Reviewed 2026-10-12 against implementation `0f6319b`; native implementation `0f6319b`.
This is an index of scoped evidence, not a declaration that the complete release
or New API comparison is qualified. Linked runs identify their own implementation
revisions. Fixture outcomes provide no evidence. Current-input runs and
independent saved-artifact/database checks define the verified boundaries.

| User priority | Implemented and exercised scope | Remaining verification boundary |
| --- | --- | --- |
| Supplier configuration | Business identity, independent credential configurations, rotation/disable isolation, model and price binding, scoped configuration traffic | Nonempty agreed commercial earnings and settlement; complete Supplier frontend journey |
| Workspace API keys | Scoped actual model calls, spending/RPM/TPM/concurrency/IP policies, immutable policy history, rotation lineage, revocation and restart | Broader cross-protocol combinations and unknown-disconnect occupancy; new video dispatch/recovery with no-expiration keys remains unverified |
| Balance and charging | Exact original-rate debits using approved internal credit, insufficient-capacity refusal, reservations, invoice settlement, refunds and reconciliation | Positive externally funded top-ups and customer-paid media have separate unverified scope; supported payment inventory does not require every merchant to activate |
| Logs and usage | Populated customer pagination, concurrent admissions during time-ordered pagination, key filters, full-range totals, CSV, error/timing records and confidential procurement isolation | Mutable-sort pagination, broader tenant scale and frontend presentation |
| Video | Actual personal generation, idempotent submission, durable saved intents, restart/query recovery, authorized decoded results and deletion that survives refresh | Positive customer-funded settlement, natural expiry, inspected reference inputs and model-specific controls need their own evidence |
| Performance | Two-Gateway actual text workloads, including 1,600 streams at offered 16 requests/second with exact post-restart accounting | Maximum capacity, overload, production SLOs, media capacity and a measured New API baseline |

## Evidence to inspect

- Supplier identity and independent keys: [configuration usage](../reference/supplier-configuration-usage.md) and [key isolation](../reference/supplier-key-isolation-live.md).
- Key controls and real streams: [spending and concurrency](../reference/api-key-spending-limits.md); policy errors must not imply an operation completed.
- Exact charging and recovery: [customer reconciliation](../reference/customer-charge-reconciliation.md), [supplemental usage](../reference/token-category-reconciliation.md) and [mixed procurement recovery](../reference/upstream-cost-recovery-paging.md). Procurement costs are not customer charges.
- Payment capability versus activation: [supported integration inventory](../reference/payment-aggregators.md). Checkout and browser returns never authorize funds; no invented paid order or commercial agreement closes a gap.
- Request details: [current persisted diagnostics](../reference/customer-request-detail-live.md), including every detail in the current 1,600-stream history and two retained real refusal states.
- Populated reports and measured performance: [two-Gateway text workload](../reference/two-gateway-text-load.md), including independent checks across all 1,600 responses and customer exports.
- Video persistence: [personal lifecycle](openrouter-video-gateway-verification-2026-10-09.md), [durable submission intents](../reference/video-submission-intents.md), [deletion and contention](video-result-deletion-live-2026-10-09.md) and [settled quantity boundary](video-settlement-quantity-verification.md).
- HTTP integration surface: [backend contract](backend-integration-contract.md) and [generated operation reference](../reference/generated-api-operations.md). An authenticated empty read or catalog HTTP 200 does not prove inference.

## OpenRouter diagnosis boundary

Actual committed workloads demonstrate successful streams for the exercised
personal access. They do not reconstruct the original historical 502 root cause.
Connection/catalog success alone is insufficient. Canonical generation metadata
can supplement supported terminal usage, but cancelled or identity-mismatched
observations retain a safe unresolved state; see the
[model identity and cancellation boundary](../reference/token-category-reconciliation.md).
No commercial discount, resale qualification or alias-resolution capability is
inferred from personal testing.

## Workstream boundary

Backend implementation and actual business/performance verification continue on
main. Frontend design and rendered acceptance belong to the frontend workstream;
container/image qualification and Agent Observability are excluded from this
backend iteration. Existing databases and encrypted identity remain preserved.
Public and enterprise issues close only when their own full acceptance is proved;
a partial checkpoint does not close a broader release issue.


## Documentation delivery checkpoint

A clean archive of committed `58e8fc3` completed the documentation build and
handler-annotation consistency check. A local HTTP server served all 17 generated
index-page routes and their linked local resources: 30 unique paths were read
completely, with page bytes compared to the retained generated artifacts. The
handler OpenAPI JSON was accessible and retained the committed Messages and
`/v1beta/models/{model_action}` operations. Uncommitted interface changes were
excluded from this artifact. The error page accounts for the build's additional
page and was not part of the index-route check.

This verifies generated documentation delivery over HTTP, not browser visual
layout, interaction states or deployment. Browser presentation remains unverified.
The documentation links to scoped payment claim/query recovery and concurrent
customer reporting evidence; those runs retain their own executable revisions.


## Combined Chat tools and JSON format

The earlier `0b304dc` implementation returned explicit 501 for this combination
before dispatch, despite declared individual capabilities. Actual direct upstream
support did not establish Niu support. Clean `a5f2f3b` now implements intermediate
function turns and structured final text through the existing validators.

[The current contract and scoped verification](../reference/chat-tools-structured-output.md)
cover four real buffered/streamed schema/object round trips, independently checked
native usage, exact customer debits and restart. Function selection, bounded
stream assembly and final-text validation remain distinct. Malformed combined
upstream output and broader provider combinations still need their own evidence.


## Text-mode streamed function validation

Clean `5a8a39c` extends the existing bounded collector to ordinary text-mode tool
streams, retaining free-text final answers and independent accounting. Four real
buffered/streamed text round trips and four fresh JSON-format round trips were
independently parsed and reconciled with their exact original-rate debits and
restart. The [tool contract](../reference/chat-tools-structured-output.md#plain-text-streamed-tool-validation--2026-10-12)
records the limits and separate totals. Two later real malformed text-tool streams
were independently checked for terminal refusal, exact debits and scoped customer
list/detail/CSV diagnostics; other malformed/provider cases remain unverified.
The native upgrade preserved the original database/configuration/encrypted identity.


## Published catalog eligibility under contention

Clean `9bc2105` bounds the published catalog's live Supplier/cooldown eligibility
read through the existing shared read-only transaction initializer. An actual
workspace-key catalog request returned 503 while an eligibility table remained
locked, then recovered its complete directory and a real, exactly charged stream
after release/restart. The [Supplier configuration evidence](../reference/supplier-key-isolation-live.md#bounded-published-catalog-eligibility-read--2026-10-12)
records the old waiting request, current refusal, independent original-history
and recovery checks, and the remaining whole-catalog/performance limits.


## Recorded failures independent of HTTP headers

Clean `7fa886b` adds `status=recorded_failure` to request list/summary and CSV,
with the same SDK/OpenAPI value. Actual mixed success and HTTP-200 SSE failures
verified selection, pagination, full-range totals, exact charges, SDK HTTP calls
and restart. A separate real-refusal history verified that unrecorded uncertain
execution remains outside the filter. See the [filter contract](../reference/recorded-request-failure-filter.md).
Existing HTTP-error filtering and financial states retain their meanings.


## Saved video identity lookup under contention

Clean `73d0c46` bounds saved-submission identity reads without changing their
request-digest comparison or granting a new dispatch. Actual legacy creation
replay over an existing generated video refused a held database lock, restored
the same succeeded job after release/restart, rejected changed input and revoked
keys, and retained one original submission with no financial mutation. An actual
result download matched the retained MP4 and independently decoded. The
[video identity checkpoint](../reference/video-submission-intents.md#bounded-saved-submission-identity-read--2026-10-12)
keeps intent-submit, browser, paid media and complete-deadline scope explicit.


## Current mixed streaming/reporting workload

Clean `73d0c46` completed 240 new actual streams alongside 1,200 ordinary customer
report reads over the retained 1,600-stream history. Four actual invalid tool
streams remained explicit failures with known, exactly charged usage. Independent
reopening checked all 1,840 responses, final report/filter/CSV totals and single
debits; restart retained reports/exports and identities were revoked. The
[mixed workload checkpoint](../reference/two-gateway-text-load.md#current-mixed-streaming-and-customer-reports--2026-10-12)
records current timings and the limits of short one-Gateway evidence.


## Customer top-up recovery reads

Clean `7d7df96` bounds customer history/detail reads and keeps a history cursor
and page on one read-only snapshot. Actual HTTP requests over a retained real
uncertain intent refused database locks, recovered after release/restart and
kept exact amounts and all financial records unchanged. Saved reads remained
available with all merchant checkouts disabled. The [payment checkpoint](../reference/payment-aggregators.md#saved-customer-top-up-reads-under-contention--2026-10-12)
separates recovery/support readiness from external merchant activation and
positive funding, without requiring every integration to activate.


## Shared balance reads under contention

Clean `420ef96` bounds the existing single-statement company balance snapshot.
Actual company-owner reads over settled 1,840-stream debits and a separate real
unresolved liability returned 503 while ledger storage remained locked, recovered
after release/restart, and preserved exact balances/credit/holds. Independent
reopening recomputed the complete projection from original usage and financial
records. See the [balance checkpoint](../reference/customer-charge-reconciliation.md#bounded-company-balance-read--2026-10-12)
for separate totals and the unverified media/concurrent-policy/capacity scope.


## Complete saved key directory

Clean `e274aab` removes the legacy first-1,000-key truncation and bounds the
existing metadata read. Actual creation of 1,001 keys over retained history
reproduced ten omitted saved rows; the current complete directory, first/last
new key calls, dispatch timestamps, exact debits, lock refusal, restart and
revocation were independently checked. The [directory contract](../reference/workspace-key-directory.md)
keeps unpaged scale and browser/key-policy qualification limits explicit.


## Paced complete-key metadata reads

Clean `e274aab` completed 1,200 ordinary-viewer directory reads at an offered
20/second over the actual 1,010-key history. Every response matched the complete
native directory; independent reopening checked dispatch fields, exact response
hashes, unchanged financial/key records and measured latency/resource samples.
The [paced-read checkpoint](../reference/workspace-key-directory.md#paced-complete-directory-reads--2026-10-12)
keeps warmed local scale, scheduling, process sampling and SLO limits explicit.


## Optional workspace key pages

Clean `a78769f` adds bounded keyset pages and SDK support while retaining the
complete no-parameter compatibility response. Actual HTTP/SDK traversals covered
1,010 stored keys exactly; a later normal creation appeared at the live tail.
Missing/foreign cursors, bad limits, lock refusal, scope and restart were exercised
and independently reopened against native metadata and unchanged accounting.
The [page contract](../reference/workspace-key-directory.md#optional-bounded-pages--2026-10-12)
records the separate concurrency, scale and browser verification boundaries.


The `8aba958` [key page SQL checkpoint](../reference/workspace-key-directory.md#page-activity-lookup-cost--2026-10-12)
selects each page before dispatch-activity lookup and independently checks
page-sized activity probes on a retained real directory. Actual HTTP/SDK traversal,
scoped refusals, lock recovery and restart preserve exact existing financial
history. That revision still scans/sorts key rows; the indexed checkpoint below
addresses this observation on the retained directory.
Native refresh followed a fresh isolated backup restore and retained existing
configuration, encrypted identities and durable counts.


The [indexed keyset checkpoint](../reference/workspace-key-directory.md#indexed-keyset-selection--2026-10-12)
adds schema 0279's workspace/order index. Actual existing-data startup, HTTP/SDK
traversal and independently reopened native plans show page-sized key selection
and activity lookups without sorting on the retained directory. Financial counts
and totals, configuration and encrypted identities remain unchanged. Broader
scale and sustained deep-page performance remain unverified.


The same indexed executable's [paced first-page reads](../reference/workspace-key-directory.md#paced-indexed-first-page-reads--2026-10-12)
record 1,200 actual viewer requests at 20/second and independent response/native
checks, including restart and unchanged financial history. This measures the
stated local first-page workload, not deep-page saturation or a production SLO.


The [bounded source-policy read checkpoint](../reference/api-key-ip-policies.md#bounded-source-policy-reads--2026-10-12)
checks unavailable key-source verification before dispatch, actual recovery
inference with exact charging, deny-all enforcement across restart and revocation.
Storage timeout does not bypass an IP policy. Independent native reopening
preserves earlier financial history plus the sole accurately debited recovery call.
Broader admission races, proxy configuration and performance remain unverified.


[Key-controlled tool streaming](../reference/key-controlled-tool-streaming.md)
combines actual two-turn text tool streams with five pre-dispatch key policies,
rotation, RPM/spending refusal and restart. Independent stream/native checks
verify four exact charges/debits and no extra request on refusal. This adds
integration evidence; TPM/concurrency exhaustion and sustained combined traffic
remain outside this run's scope.


[Explicit no-expiration keys](../reference/non-expiring-workspace-keys.md)
add required null-or-finite lifetime input and nullable expiry metadata. Actual
owner/viewer checks, natural finite expiry, two accurately charged calls,
rotation/restart, SDK traversal, spending refusal and revocation were independently
checked. Existing finite dates and original installation identity remain intact;
no-expiration video and broader concurrent behavior are unverified.


The [JavaScript key lifecycle checkpoint](../reference/non-expiring-workspace-keys.md#javascript-lifecycle-client--2026-10-12)
adds create, metadata PATCH, rotate and revoke methods with exported input/result
types. Actual SDK fetches, owner/viewer permissions, stale revisions, natural
finite expiry and two exact charged calls were independently checked. Backend
runtime remains `67b0ed2`; this SDK-only change does not replace its executable.


[Saved video access with no-expiration keys](../reference/non-expiring-workspace-keys.md#saved-video-access-with-no-expiration-keys--2026-10-12)
independently verifies identical decoded artifacts through original and rotated
keys after restart, natural finite peer expiry, source/scope refusal and revocation.
Original generation and financial records remain unchanged. This is result-read
evidence; new video dispatch and paid media settlement remain separately unverified.


[Saved video query observations](../reference/video-query-observations.md)
add key and dashboard read interfaces plus SDK methods. Actual missing-quantity
receipts, two-row pagination, scoped refusal, bounded receipt-table locks and
restart were independently reconciled without changing any business/financial
record. Current direct OpenRouter metadata still supplies no usable quantity for
the seconds tariff; expenses and estimates are not customer billing evidence.

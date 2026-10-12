# Request reporting acceptance matrix

This records the finite S07-2/S07-3 backend evidence for the request-to-Logs-to-usage-to-billing/export journey and customer procurement confidentiality. It distinguishes fresh current-input reads from historical inference/report workloads. No fixture outcomes, new model calls, UI acceptance or Agent Observability claims are included.

## Interfaces and meaning

The [root OpenAPI contract](../../contracts/openapi.yaml) and [handler contract](../../contracts/generated/handler-operations.json) define the serialized fields. All workspace request routes retain the compatible base `/admin/v1/organizations/{organization}/projects/{project}`.

| Method and suffix | Customer meaning |
| --- | --- |
| GET `/requests` | Filtered Logs page plus full-range matching summary; follow `next_cursor`, not only the first page. |
| GET `/requests/{attempt}` | Same saved request identity, execution/usage certainty, customer charge, failure and timing. |
| GET `/requests/export` | Customer CSV with the selected matching request rows; unknown quantities remain empty rather than zero. |
| GET `/requests/{attempt}/usage-reconciliation` | Saved usage supplementation receipt subject to its contract and authorization; not an upstream expense report. |
| GET company `/admin/v1/organizations/{organization}/billing/balance` | Customer account totals and held capacity, not Supplier procurement. |

A request's `customer_charge_nanos` is a customer selling charge. Supplier expense is never substituted when that charge is unknown. `usage_confidence`, `execution`, nullable quantities, `customer_charge_status`, failure and timing are independent observations. SSE HTTP 200 alone does not prove successful completion; a terminal stream failure can retain known billable usage. An incomplete monotonic timing is not complete generation latency.

## Actual evidence matrix

| Evidence scope | Independent verification | Proven boundary |
| --- | --- | --- |
| Fresh isolated native HTTP reads of two retained real category-priced requests on runtime `3fdc669c60a74038e138cf03eaca0e0a4964750d` | Ordinary workspace viewer reads Logs, details, CSV and company balance. Detail matches installation read; actual nonzero cache-write/read/reasoning quantities and customer charges match reopened native charges/debits. Logs and details contain the same two request identities. Restart retains identical CSV bytes and details; no new attempt or financial entry. | Current-input customer projection of these existing actual requests. Two rows do not prove multi-page coverage. |
| Fresh full-range current native HTTP reads on digest-pinned `1212ea3b68f934c22fff6c62696475d2f628fc6a` | A stopped copy of the real 1,840-request workload migrated through schema 284, then an ordinary workspace viewer read all 19 pages, success/error request details and the complete CSV. Every page retained the full 1,840-request summary and 31,273,840-nanounit customer total. Independent native reopening reconstructed every charge from actual saved quantities, matched each row and complete CSV, checked artifact digests and unchanged full financial fingerprints. Restart preserved identical first page and CSV. | Fresh multi-page/report integration over genuine saved inference, without submitting 1,840 new model requests. Foreign reads are 404, procurement route 403; the workspace-scoped viewer cannot read company balance (404). Platform balance projection remains customer-safe. |
| Historical actual mixed stream/report workload on digest-checked runtime `e704955ed0441288bc30827a7434b73218b3a06d` | Retained original 1,840 response digests/usage, 1,200 report artifacts, final summary and all/failed CSV independently match native attempts, charges and debits. Full total is 31,273,840 nanounits. Four actual invalid tool-result streams retain known usage and 106,668 nanounits in the failed subset. Each error stream lacks successful DONE; saved timing and failure match. | Full-range totals and filtered failure views across the exercised workload. This is historical evidence, not a new latest-runtime performance run. Intermediate summaries retain their own request-time snapshots. |
| Historical mixed pagination | Retained pages are checked against saved request identities, full-range usage and customer charges; rejected upstream requests retain null charge. | Pagination plus full-range totals for that exercised dataset, distinct from the fresh two-row checkpoint. |
| Genuine unknown timeout | Saved detail/CSV/token policy and reopened native state agree on `may_have_executed`, unknown/null usage, pending/null customer charge, failure classification and retained exact liability. | Unknown is preserved across customer serialization; no invented zero charge or successful completion. |
| Actual completed personal video | Saved JSON and CSV agree with the real completed job, personal funding and absence of customer charges; native transport and financial counters remain unchanged. | Personal video reporting, not positive paid-media accounting. |
| Fresh authorization and confidentiality | Foreign company access returns 404; ordinary customer's procurement-cost route returns 403. Recursive JSON inspection excludes procurement prices/cost, margins, credential ciphertext and private endpoint fields. CSV headings contain no Supplier/procurement/margin/credential columns. | The enumerated customer reports and exports, not every administrative API or future field. |

The latest independent reinspection also checks historical category JSON/CSV and the actual unknown timeout/personal video records. Saved artifact hashes and reopened PostgreSQL states are authoritative within each scope. Retained historical artifacts are not promoted to a fresh execution merely because their reader was rerun.

## Current source continuity

A comparison from runtime `3fdc669c` to source baseline `1212ea3b` found no changes to `apps/gateway/src/request_timings.rs`, `apps/gateway/src/admin/request_exports.rs`, `apps/gateway/src/admin/request_payloads.rs`, `apps/gateway/src/billing.rs`, or the compared `crates/storage/src/request*`, `customer*` and `attempt*` source paths. In `apps/gateway/src/admin.rs`, the differences are a workspace-alias module declaration and workspace/profile handler contract comments; the request reporting handler bodies are unchanged.

This supports reuse of the fresh native reporting checkpoint for those unchanged projections. It does not imply the complete binary or media submission path is unchanged. Recent video ingested-image identifiers describe scoped stored inputs rather than private URI exposure, but this checkpoint has no positive new ingested-image dispatch/report evidence and makes no such claim.

## Closure and remaining scope

The evidence supports the enumerated customer text/category, known-error, unknown-timeout and personal-video reporting paths. The fresh `1212ea3b` checkpoint now closes the previous current-native multi-page evidence gap: all 19 pages and full-range summaries/CSV match independently reopened native accounting. It reuses real saved inference; it does not rerun the historical inference load or qualify new protocol/media execution. Receipt metadata, cancellation-specific timing and other supported protocol details retain their separate evidence in [request failure diagnostics](request-failure-diagnostics.md), [interrupted stream reporting](interrupted-stream-reporting.md), [category reconciliation](customer-charge-reconciliation.md) and [current mixed load](current-authentication-mixed-load.md).

These boundaries must be retained when deciding whether S07-2/S07-3's declared supported matrix is complete. Paid-video charge serialization, new ingested-input positive paths and unexercised diagnostic combinations cannot be inferred from the personal-video or two-row checks. Frontend rendering remains separate ownership. No customer-facing response may expose procurement information even to an installation administrator using a customer workspace report.

## Current mixed-protocol report supplement

The [protocol checkpoint](inference-protocol-acceptance-matrix.md) adds eight real
current-native Chat, Responses, embeddings and Messages requests. All eight are
read back through Logs/detail with their exact operation IDs, full-range summary
and CSV. Independently reopened native records match reported quantities,
original frozen tariffs, charges and debits; recursive projections exclude
procurement and margin fields. Genuine initial Messages unknown usage and held
capacity are preserved, then canonical receipt recovery produces one exact
charge/debit each and releases the holds without rewriting missing cache-write
quantity to zero. No generation is repeated for recovery.

Together with current complete pagination, this closes S07-2/S07-3 for the
supported customer reporting matrix. Unqualified direct-provider execution,
positive paid media and new ingested-image dispatch retain separate S03/S05/S08
acceptance; their positive outcomes are not inferred from these report checks.
New report fields must retain the same backend confidentiality enforcement.

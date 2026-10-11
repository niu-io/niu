# Durable request failure diagnostics

Workspace request records expose nullable `failure` independently of optional
request/response payload retention. The CSV export appends `Failure kind` and
`Upstream HTTP status` columns. The JavaScript SDK exports `RequestFailure`;
older servers may omit the field. No frontend presentation is implied by the
backend field.

The failure vocabulary includes OpenAI-compatible Chat failures before streaming
begins and response-body cancellation:

| Kind | Meaning | Upstream HTTP status |
| --- | --- | --- |
| `upstream_http_error` | A non-success upstream HTTP response | Reported status |
| `upstream_region_unavailable` | Recognized HTTP 403 regional model refusal | 403 |
| `upstream_timeout` | The outbound request timed out before response headers | Unknown |
| `upstream_connection_error` | Connection establishment failed | Unknown |
| `upstream_transport_error` | Another outbound transport failure | Unknown |
| `upstream_invalid_response` | A successful upstream response failed adapter validation | Unknown |
| `response_stream_cancelled` | The response body was dropped before terminal or explicit upstream failure handling | Unknown |

Classifications contain no arbitrary upstream messages, URLs, credentials,
response metadata, prompts or Supplier prices. HTTP status is a separate fact
from execution and billing. A refusal does not fabricate zero usage, release an
uncertain liability, or declare an attempt never executed. A malformed terminal
completion can still carry independently valid usage that must settle normally.
Invalid responses return the fixed message `The provider returned an invalid
response`; arbitrary upstream content never enters this explanation. A known
finish reason can coexist with a delivery failure, such as malformed tool-call
arguments. Neither a `tool_calls` reason nor HTTP 502 alone establishes whether
execution occurred or whether reported usage exists.

The gateway records one scoped, immutable classification before returning its
failure response. Identical persistence retries are idempotent; conflicting
observations cannot replace the first. Storage failures are logged and leave
classification unknown. Records survive payload opt-out, payload deletion and
gateway restart. Older attempts are not retroactively classified from HTTP
status alone. A null value means no recorded classification; it does not mean
success. Cancellation classification does not identify who cancelled delivery or
prove upstream nonexecution. Protocol coverage must be established per path; the
native Messages cancellation checkpoint below does not qualify every adapter or
all midstream failure modes.

Use request scope and timing alongside `failure`. Ordinary workspace read
permissions apply to the Logs API and CSV; a foreign workspace cannot retrieve
these records. Diagnostic metadata does not grant access to Supplier accounting.

## Mixed failure and completion reporting — 2026-10-11

A fresh isolated current-input run retained one actual upstream authentication
failure and two successful personal OpenRouter completions. After gateway restart,
workspace request history was read with a one-row page size. The three pages
contained every stored attempt exactly once; each page's full-range summary
reported three requests, two provider-reported usage records and the sum of the
two customer charges, independently of the loaded row.

An independent verifier reopened the stopped database, matched the saved page
identities to all attempts, reconciled reported token totals to the actual
completed response quantities, and checked customer charge/debit arithmetic.
The authentication-failed attempt had a null customer charge and no charge record.
There were no open customer holds. A recursive response inspection found none of
the checked procurement/credential fields (`cash_nanos`, `api_equivalent_nanos`,
`supplier_cost`, `credential_ciphertext`, `api_key`). This field check supplements
rather than replaces the separate authorization and commercial-boundary work.

Internal tariffs and approved credit were verification inputs, not payment
receipts or Supplier qualification. This checkpoint covers mixed authentication
failure/completion reporting and pagination after restart; cancellation, retries,
all filter combinations and customer-facing rendered diagnosis remain separate
verification scopes. The original development database and identity were preserved.


## Cancelled native Messages reporting — 2026-10-11

A stopped isolated database containing two previously completed real tool turns
was copied, then the current gateway made a fresh native Messages streaming call.
The client closed after receiving an actual partial tool-argument JSON fragment,
before `message_stop`. After key revocation and gateway restart, customer request
APIs retained `response_stream_cancelled`, `may_have_executed`, unknown usage,
null customer charge and null completed duration for that attempt.

The one-row request page still summarized the entire three-attempt history:
two known-usage requests, one unresolved customer charge and two complete timing
samples. Independent reopening matched the saved API report to the database and
received SSE prefix: one customer hold remained, the two earlier exact debits were
unchanged, and the incomplete cancellation was excluded from completed latency
samples. No completion, zero usage or refund was invented for the interrupted
request. Its eventual upstream settlement remains unresolved by this run.

### Reconciliation refusal for cancelled upstream metadata

For a matching stored generation reference and model, metadata that does not
confirm a non-cancelled terminal generation now returns HTTP 409 with
`usage_reconciliation_incomplete`. Route eligibility, reference/model mismatch
and conflicting evidence retain their separate existing conflict handling.
The new error does not relax the trusted-usage or completion requirements and
does not resubmit inference. Token quantities alone do not satisfy this recovery
path's completion contract.

An actual reconciliation of the retained cancelled native Messages request
previously returned the generic `conflict_error`. An independent upstream lookup
confirmed the matching reference/model, `cancelled: true`, null finish reason and
present native token counts. With the change, the same workflow returned the
explicit incomplete-reconciliation reason. Independent database reopening
confirmed the attempt remained `may_have_executed` with unknown usage, no new
receipt or charge, one unreleased customer hold and two unchanged prior charges.
Full-row fingerprints for attempts, charges, balance entries/reservations and
usage receipts were unchanged through the refused reconciliation and restart.
The isolated copy and original saved database remained separate. Eventual
settlement of cancelled executions is not qualified by this refusal checkpoint.

### Cancelled billing recovery design boundary

The [OpenRouter streaming guide](https://openrouter.ai/docs/api_reference/streaming)
describes provider-dependent cancellation. Its
[cancelled-generation export documentation](https://openrouter.ai/docs/guides/features/broadcast#cancelled-generations)
distinguishes billed quantities from provider processing and warns that absent
usage provenance is unknown. The
[generation metadata API](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
is a separate surface; export-specific guarantees must not be assumed for it.

The actual saved cancelled metadata has native counts but no finish reason,
`usage_is_estimated` or `finalized_at`. Absence is not proof of zero cost or final
measurement. Repeated identical reads alone would not prove finality either.

Future cancelled-charge recovery must separate execution outcome, delivery and
billing evidence. Preserve cancellation instead of marking the attempt completed;
retain immutable quantity provenance and category coverage; apply original
customer tariffs only to qualified quantities; settle/release exactly once under
existing ledger locks. Never use upstream currency cost as the customer charge.
A new receipt version and state-transition rules are required: current v2 receipts
explicitly require non-cancelled terminal completion. Partial category evidence
must keep affected liabilities unresolved. This is an implementation boundary,
not an available recovery feature or justification for releasing existing holds.


## Bounded failure recording under an actual upstream refusal — 2026-10-12

Failure recording now uses the shared bounded recording transaction. The shared
inference response path logs the fixed failure category, optional HTTP status
and internal attempt correlation when persistence or reservation release fails.
It never logs provider response bodies, endpoints or credentials. Failure to
record an observation does not authorize a nonexecution transition or release.

An isolated native PostgreSQL run used a deliberately invalid credential against
the real canonical OpenRouter endpoint and requested Chat streaming. With an
exclusive lock on `request_failures`, previous `268c25d` remained pending for
1.6 seconds after the actual upstream refusal was observed; only releasing the
lock allowed its response. Clean committed `ca4e5a9` returned sanitized HTTP 401
while the lock remained held, in 880.50 ms including the upstream round trip.
This measures the full observed request, not a constant response-time guarantee.

The refused recording transaction left no failure row or nonexecution evidence
for the first attempt. Its execution and usage remained uncertain, with customer
and procurement reservations held. Safe logs retained `upstream_http_error`,
401 and that attempt's correlation. After releasing the lock, another actual
upstream 401 recorded the immutable failure and qualified nonexecution under
the existing pinned canonical OpenRouter text policy; only that second attempt's
reservations were released. Restart preserved the first attempt's uncertainty.

Independent reopening checked both saved error responses, the lock diagnostic
and clean executable digest, two HTTP 401 timing records, safe log context,
atomic failure/nonexecution state and the separate retained/released holds.
No credential appeared in responses or logs; there were no customer charges,
balance entries or funding receipts. The scoped verification key was revoked.
Native replacement preserved original configuration, encrypted identities and
durable record counts, after a fresh backup restored with matching business
fingerprints.

This verifies bounded recording refusal for an actual OpenRouter HTTP rejection.
Other provider classifications and interrupted-stream branches require their own
evidence. It neither reconstructs the historical GPT-4.1-mini 502 cause nor adds
automatic replay of a failure observation lost during database refusal. Unknown
liabilities remain unresolved until genuine recovery evidence is available.


## Customer projections of recorded and unrecorded refusal — 2026-10-12

A separate stopped-database copy of the preceding actual OpenRouter refusals was
served by the same clean `ca4e5a9` executable. An ordinary company viewer read
workspace Logs and CSV, rather than using installation privileges. The first
request retained `may_have_executed`, null failure classification and `pending`
customer charge status. The second retained `confirmed_not_executed`, immutable
`upstream_http_error` / 401 and `not_charged`. Both delivery timing records showed
401. Input/output quantities and customer amounts remained null in JSON and
blank in CSV; neither absence was turned into a zero quantity or charge.

Independent reopening checked the saved customer projections and export against
both original error artifacts, immutable failure state, request timings and
retained/released reservations. There were still exactly two attempts and no
customer charge, balance entry or funding receipt. Restart preserved the full
Logs response and byte-identical CSV. Recursive customer response checks found
no procurement fields; the procurement endpoint returned 403, and a different
organization could not read the request list or export. Both temporary readers
were revoked and a subsequent revoked-reader export returned 401. The original
evidence database and development runtime were unchanged; no inference was
repeated for these reads.

A null failure object means no immutable classification is available, not that
delivery succeeded or the model did not execute. Delivery HTTP status and
execution/accounting evidence have separate meanings. Likewise, a provider's
401 response with `error.type=upstream_error` is distinct from Niu rejecting the
client key. Customer presentation must preserve pending/unknown states and use
the typed error context instead of treating every 401 as a revoked Niu key.
This qualifies backend serialization and access for these records, not frontend
rendering or automatic recovery of the missing failure observation.

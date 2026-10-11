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

# Durable request failure diagnostics

Workspace request records expose nullable `failure` independently of optional
request/response payload retention. The CSV export appends `Failure kind` and
`Upstream HTTP status` columns. The JavaScript SDK exports `RequestFailure`;
older servers may omit the field. No frontend presentation is implied by the
backend field.

Current capture covers OpenAI-compatible Chat failures before streaming begins:

| Kind | Meaning | Upstream HTTP status |
| --- | --- | --- |
| `upstream_http_error` | A non-success upstream HTTP response | Reported status |
| `upstream_region_unavailable` | Recognized HTTP 403 regional model refusal | 403 |
| `upstream_timeout` | The outbound request timed out before response headers | Unknown |
| `upstream_connection_error` | Connection establishment failed | Unknown |
| `upstream_transport_error` | Another outbound transport failure | Unknown |
| `upstream_invalid_response` | A successful upstream response failed Chat envelope or stream content-type validation | Unknown |

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
success. Midstream failures and other protocol paths are not yet covered by this
classification field.

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

# Upstream retry policy

The shared `niu-upstream` HTTP client explicitly configures
`reqwest::retry::never()`. The pinned reqwest implementation otherwise retries
some protocol-level negative acknowledgments that it considers safe to retry.
This change makes the transport policy explicit: application retries should be
decided alongside durable attempt state, not added invisibly by that policy.
It is not evidence that the previous default duplicated a paid execution.

Redirects remain disabled. A transport error after dispatch is not proof that
the Provider did no work. Unknown execution and its outstanding liabilities
must remain visible until independently resolved. A downstream disconnect does
not authorize another generation submission. Video status polling is a query of
an existing job and must not be confused with resubmission.

This policy applies to callers using the shared client. It does not establish
the retry behavior of every native adapter or third-party dependency, nor does
it guarantee that an upstream service itself never retries internally.

## Routing gap

Generic resolution now supports revisioned text candidate pools above existing
supply aliases, including enabled membership, priority and weighted selection.
The [pool checkpoints](model-route-pools.md) record actual selection, customer-price
separation and a candidate change during a priced stream. The generic Chat handler
still makes its selected call without a business-level fallback loop. Selection
for a new request is distinct from retrying an existing request. Circuit breakers
and specialized adapter retry behavior require separate qualification.

Complete failover needs explicit eligibility, bounded retry policy, preserved
customer pricing and grants, distinct durable attempts, and a rule preventing
resubmission when prior execution is uncertain. Its behavior under actual
upstream rejection, partial streaming, disconnect and restart remains open.

## Current-input verification — 2026-10-10

After optimized compilation and restarting the gateway with its existing
database and encryption identity, a fresh temporary workspace key made an actual
personal OpenRouter streaming Chat request. The response returned HTTP 200,
nonempty content, reported token usage and the final `[DONE]` marker. Independent
PostgreSQL inspection found exactly one dispatched attempt for that key, with
confirmed completion and prompt/completion counts matching the received usage.
The temporary key was revoked.

Formatting and Clippy completed. This verifies the ordinary streaming path on
the updated binary. No protocol-level negative acknowledgment occurred in this
run, so retry suppression during that fault remains unverified. A single durable
attempt does not independently prove the number of network transmissions or
upstream internal executions. No fixture result is used as evidence.

## Existing nonexecution classification and current verification

`Store::save_request_failure` already recognizes one limited case: an immediate
OpenRouter text HTTP 401 recorded as `upstream_http_error`, with unknown usage and
no asynchronous media recovery binding. It records `confirmed_not_executed` and
releases eligible customer and procurement reservations. Stream failure recording
has no upstream HTTP status and therefore cannot enter this branch. Other
providers/statuses and transport uncertainty retain their existing semantics.
This classification is not a generic retry authorization or a fallback loop.

A fresh native current-input run with operation tariff binding enabled sent an
actual request using a deliberately invalid credential in an isolated OpenRouter
configuration. The gateway returned a sanitized 401 without exposing either the
invalid or saved real credential. Independent records showed nonexecution, no
customer charge, released customer/procurement holds, zero procurement reserved
amount and zero committed key allowance. After correcting only that isolated
configuration and restarting, a new request completed with the requested fresh
marker and an exact usage-based debit. The two separate requests produced two
attempts but only one customer charge; reconciliation had no discrepancy. Original
configuration and encrypted identity were preserved and isolated processes stopped.

This verifies rejection and explicit operator correction, not an automatically
selected successor, same-operation append or a retry after uncertain execution.
Future failover must preserve the qualified adapter/endpoint rejection contract
and durable predecessor evidence rather than generalizing any HTTP 401 into
permission to resubmit.

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

Source inspection of generic model resolution found one selected stored route
per alias, or the applicable static configuration; personal routes are scoped
to their owner before shared resolution. This is not a complete candidate pool,
weighted selection, circuit breaker or failover implementation. The generic
Chat handler makes its selected call without a business-level fallback loop.
Specialized adapter paths require separate review.

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

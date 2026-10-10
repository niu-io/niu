# Response stream cancellation diagnostics

Request failure metadata now includes `response_stream_cancelled`. It means the
gateway response body was dropped while its attempt still awaited terminal or
explicit upstream-failure handling. It does not identify who cancelled delivery:
a downstream disconnect and cancellation of the serving task can both drop the
body. It is not proof that the Provider did no work.

The classification has null `upstream_http_status`. HTTP headers may already have
been delivered as 200; incomplete request timing and partial payload metadata
remain separate observations. Existing terminal completion and explicit upstream
failure handling consume the pending context first, so normal completion and
known upstream errors are not relabeled as cancellation.

The cancellation observation uses the existing scoped, immutable, content-free
failure storage and the diagnostic task tracker. Graceful shutdown gives it the
same bounded [diagnostic drain](graceful-request-diagnostics.md). Database failure,
forced termination or the drain deadline can still prevent its persistence. No
historical missing failure is backfilled or inferred from an old incomplete row.

## Execution and accounting boundary

Cancellation never establishes nonexecution, supplies missing usage, starts a
replacement request or releases a customer/procurement hold. It does not count
toward credential cooldown. Unknown execution and key concurrency occupancy
remain durable, including after key rotation and gateway restart. Normal stream
completion still uses reported usage for exact settlement. The failure reason
contains no payload, endpoint, credential or Supplier price.

Migration 0237 extends the failure constraints. Request detail, the shared
observability contract, generated OpenAPI and JavaScript `RequestFailure` type
include the new value. Chat and Responses stream handlers use the pending-context
guard; the current-input verification below exercises Chat.

## Current-input verification — 2026-10-11

A fresh isolated native gateway sent a real OpenRouter request for a long answer.
The client read actual content and closed its response before terminal usage.
The previous binary retained unknown execution, the monetary hold and incomplete
timing but had no failure classification. Its rotated key still received a
concurrency denial after restart; no completed charge was fabricated.

With the updated binary, the same current-input flow recorded
`response_stream_cancelled`, exposed it through request detail and retained the
original positive customer hold. Rotating the key and restarting still denied
another request, with only the original cancelled attempt present at that point.

Two further current-input controls used a separate temporary key:

- A normal real stream returned the requested fresh marker, terminal `[DONE]`
  and usage. It produced no failure classification and exactly one usage-based
  charge/debit.
- A long real stream under a one-second request deadline recorded
  `upstream_timeout`, rather than cancellation, and kept its unknown liability.

Independent reopening found exactly three attempts: one completed with reported
usage and an exact charge/debit, one cancelled and one timed out with unknown
usage. Both uncertain attempts retained customer and procurement holds. The
cancelled record retained an incomplete HTTP-200 timing and matching inspected
request payload with incomplete response capture. There was no credential
cooldown or extra submission; restart retained the states.

The upstream account was personal/self-funded and the customer rates/credit
were internal verification configuration. No merchant funding or commercial
Supplier qualification was claimed. Original development data and encrypted
identity were unchanged. Fixture outcomes were not used as evidence. The full
Responses cancellation matrix, terminal/cancellation races and forced-loss
recovery remain separately unverified.

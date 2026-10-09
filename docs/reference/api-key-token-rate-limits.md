# API-key token rate budgets

A finite token budget admits supported text requests by reserving an estimate before
upstream dispatch. PostgreSQL serializes admission across gateway instances and
shares policy and usage across secret rotation. This is a token-budget admission
control, not a provider-exact tokenizer or an absolute guarantee against reported
usage exceeding the estimate.

## API and SDK

Use `GET` and `PUT` at
`/admin/v1/organizations/{organization}/projects/{workspace}/keys/{key}/token-rate-limit`
and `GET .../history`. The [contract](../../contracts/key-token-rate.openapi.yaml)
is linked from the primary OpenAPI. Scoped readers can inspect; owners and
installation administrators can change configuration. PUT requires
`tokens_per_minute` (integer 0–1,000,000,000,000 or explicit null) and
`expected_revision` (decimal string, initially `"0"`). Null is unrestricted; zero
denies dispatch. Revisions and immutable actor history follow the other key limits.
SDK methods are `getKeyTokenRateLimit`, `setKeyTokenRateLimit` and
`listKeyTokenRateLimitHistory`.

## Budget semantics

At dispatch, committed tokens are the sum of:

- Estimates for dispatched work without both confirmed completion and known
  provider-reported prompt/completion usage. These reservations do not expire
  simply because 60 seconds passed or a client disconnected.
- Actual prompt plus completion tokens of known requests completed within the
  last 60 seconds. This window uses completion time, unlike the read-only
  `token-usage-window` diagnostic, which groups by dispatch time.

The new estimate plus committed usage must fit the configured budget. Confirmed
non-execution consumes no budget. Missing budgets on prior unknown work prevent
new finite-budget admission rather than silently treating that work as free.
Lowering a limit does not cancel existing work or erase usage. Actual usage that
exceeds its estimate remains counted and can block subsequent admission; it is
never clamped to the estimate. Customer billing remains separate.

The initial estimator, `serialized-utf8-plus-output-v1`, reserves serialized JSON
request byte length plus the explicit maximum output token count. It deliberately
includes message framing and request options. Chat supports a single completion
with string message content and no requested tools/audio modalities. Responses
requires text input and an explicit maximum output. Text embeddings reserve the
serialized input request with zero output. Unsupported input or missing explicit
output bounds return 422 `key_token_bound_required` when a finite budget applies.
Video does not have a compatible token budget and is rejected under a finite TPM
policy; RPM and concurrency remain available for video.

This byte estimate can be conservative for text, but it is not an exact count of
provider-specific framing, reasoning or hidden usage. Production qualification
must review estimation behavior for each supported model. A request may exceed
its estimate; this implementation records the actual debt for later admission
rather than claiming it could prevent every possible provider overrun.

Exhausted budgets return 429 `key_token_rate_exceeded`. No fixed Retry-After is
promised: unknown work may need reconciliation. Batch admission retries only after
a definite policy rejection has rolled back all dispatches; ambiguous database
errors do not trigger retries. Policy checks and bound persistence are durable,
not per-process counters.

## Current-input evidence (2026-10-10)

Two actual gateway listeners shared a database and a key configured with exactly
one request's estimated budget. Eight simultaneous personal model requests yielded
one completed response and seven 429 rejections. Independent SQL confirmed one
dispatch and the exact stored bound. The built SDK configured the policy. Rotation
retained the budget; waiting 61 seconds after known completion restored admission.
Zero denied and explicit null restored a real model call. Three history rows were
independently verified. Temporary keys were revoked and the secondary listener
stopped.

Actual scoped-owner/viewer/foreign-workspace HTTP checks verified allowed owner
configuration, denied viewer writes, cross-workspace 404 responses, stale revisions
and member-attributed history, independently checked in SQL. An actual video
submission under a finite token budget returned 422 with one prepared attempt and
zero dispatched attempts.

A separate real stream was disconnected after initial bytes. Its token reservation
continued to block admission after rotation, a gateway restart and another 61-second
observation period. Independent SQL still showed one unresolved dispatch. Temporary
secrets were revoked without fabricating completion or releasing unknown usage.

Paid accounting, Responses/embedding live behavior under this policy, mixed-key
batch fallback, estimator overruns and sustained performance remain unverified.
Fixture outcomes do not establish any behavior described here.

A further actual Chat request omitted its output limit under a finite budget. It
returned 422 `key_token_bound_required`. Independent SQL confirmed one prepared
attempt, zero dispatches, no recorded token usage, no customer ledger entries and
no customer balance reservations. The recent token-usage endpoint stayed empty.
The temporary key was revoked. This negative personal-route check does not prove
successful paid reservation or settlement.

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
with string messages or nonempty pure-text content blocks, including validated
ephemeral cache controls, plus supported function-tool requests and text tool
results. Hosted tools, legacy function parameters and audio modalities remain
unsupported. Cache metadata, function definitions, tool choices, arguments and
result text are included in the serialized byte estimate. Price and token
admission share the same message validator. Responses
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

Paid accounting, mixed-key batch fallback, cross-protocol concurrent workload
behavior, estimator overruns and sustained performance remain unverified.
Fixture outcomes do not establish any behavior described here.

A further actual Chat request omitted its output limit under a finite budget. It
returned 422 `key_token_bound_required`. Independent SQL confirmed one prepared
attempt, zero dispatches, no recorded token usage, no customer ledger entries and
no customer balance reservations. The recent token-usage endpoint stayed empty.
The temporary key was revoked. This negative personal-route check does not prove
successful paid reservation or settlement.

## Responses and embeddings (2026-10-10)

Two temporary private model mappings reused the existing personal Supplier
credential without modifying its original model mapping. Each key was first
configured with zero token budget, then with a sufficient finite budget.

- Responses: the zero-budget request returned 429. The sufficient-budget request
  returned a real model response within its explicit output limit. Independent SQL
  confirmed exactly one dispatched/completed attempt and prompt/completion usage
  matching the response.
- Text embeddings: the zero-budget request returned 429. The sufficient-budget
  request returned two distinct 1536-dimensional vectors for two text inputs. Every
  vector element was numeric and finite, and neither vector was all zero. SQL
  confirmed one dispatched/completed attempt, matching prompt usage and zero
  completion tokens. A hash of the returned vector artifact was retained privately.

The embedding model and request protocol were checked against the
[OpenRouter embeddings API documentation](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings).
Both temporary model mappings were disabled and both keys revoked after the runs.
These are actual personal-route protocol checks, not commercial-supply or prepaid
settlement evidence. They do not qualify every input format, embedding dimension,
streaming Responses, concurrent mixed-protocol traffic or estimator accuracy.

## Budget snapshot and history lookup (2026-10-10)

The policy GET includes `snapshot_at`, `known_tokens`, `reserved_tokens`,
`unbounded_requests` and `committed_tokens`. Token subtotals are decimal strings.
The total is null when any unknown request lacks a stored estimate; otherwise it
is the exact sum of known and reserved amounts. These live fields are not included
in immutable configuration-history records. A snapshot is diagnostic; admission
still obtains the policy lock and rechecks the budget in its transaction.

Migration 0211 centralizes the budget calculation used by admission and this read.
It separates recent known completions from unresolved usage, with partial indexes
on key/completion time and key/unknown usage. A captured timestamp supplies the
known-usage window boundary. The change avoids expressing both history classes
as one time-dependent OR predicate. Large-history performance and migration time
remain unmeasured; index existence alone is not evidence of production capacity.

Actual HTTP reads checked three persisted states: a bounded disconnected stream,
a legacy unbounded disconnected stream, and a fresh completed model request.
Their snapshots respectively exposed the saved reservation, a null total with
one unbounded request, and known usage matching the new response. An independent
SQL comparison across every existing key lineage found no differences between
the prior aggregate and the new shared calculation at the same timestamp. The
fresh request completed, its next admission returned 429, and independent SQL
confirmed one dispatch with matching actual token totals. The temporary key was
revoked. These checks establish current-data behavior, not large-history capacity.
## Actual priced admission across two gateways — 2026-10-10

A current-input run on backend `5a2449d` used two gateway processes sharing a
separate native PostgreSQL database. A key's finite token budget was configured
through management HTTP to the compact serialized request byte length plus its
32-token output bound. Four simultaneous actual strict-JSON requests used the
same key, explicit internal retail rates and approved company credit.

One returned the exact requested output and reported usage; three returned 429
with `key_token_rate_exceeded`. Independent database reads found exactly one
attempt and customer charge, an exact debit independently calculated from that
response's usage, and no open customer reservation. Reconciliation had no
discrepancy and PostgreSQL had no deadlock diagnostic. Further requests during
the usage window remained denied, including after stopping both gateways and
restarting one; no extra attempt was created.

Temporary access was revoked and the isolated processes stopped. Original
credentials and data were preserved, and no external funding receipt or
commercial qualification was created. This adds priced accounting evidence for
the exercised token-budget contention path. It does not establish provider-exact
estimation, usage overruns, mixed protocols or sustained capacity; no fixture
outcome supports this checkpoint.


### Cached Chat text blocks with finite token budgets

A current-input API run reproduced a compatibility defect: a valid cached text
block with a sufficient positive key token budget returned
`key_token_bound_required`. The shared text validator now admits this supported
shape without relaxing the estimator or ignoring cache metadata.

After the change, actual API requests with zero and insufficient positive budgets
returned `key_token_rate_exceeded` before upstream dispatch and left no open
customer reservation. Raising the budget admitted a real Chat completion with
5,273 cache-write tokens; a second completion after restart reported 5,273 cache
reads. Both retained a durable token bound and produced exact category charges
and matching debits. Independent verification reopened the stopped database and
reconciled saved responses, bounds, charges and debits, confirming two dispatched
attempts, no open customer reservations and no funding. This is a single-key
format-compatibility checkpoint, not a capacity benchmark or an exact-tokenizer
claim. Existing multi-Gateway evidence above does not by itself qualify every
new request format.

### Function calls and finite token budgets

The token-bound estimator now shares the priced Chat message validator for
supported function calls and text-only tool-result conversations. It counts the
entire serialized request, including tool definitions, choices, function
arguments and result text, plus the total output ceiling. Niu does not execute
the requested function. Unsupported hosted tools, media and legacy function
parameters remain outside this budgeted shape.

An actual pre-change API request with a sufficient finite budget was rejected
as `key_token_bound_required` without dispatch. After the change, a new isolated
run used the same finite key policy for an actual streamed function call, a
buffered function call and a client-supplied text result after Gateway restart.
The returned function name/arguments and final answer matched the requested
marker. All three charged exactly once and released their customer reservations.
Independent verification reopened the stopped database, parsed the saved real
responses, and recomputed every persisted token bound from the saved request's
serialized byte length plus output limit. It reconciled three exact charge/debit
pairs, no funding and no open customer reservations. Invalid arguments, malformed
controls, hosted tools, media and an oversized tool definition were rejected by
the actual API before additional attempts were created.

An earlier independent run reached upstream dispatch but timed out. Its stored
failure remained `upstream_timeout`, execution `may_have_executed` and usage
unknown. Independent database inspection confirmed one durable token bound, no
customer charge, one retained customer reservation and no automatic successor.
That evidence is preserved separately; the successful run used new request
inputs and does not resolve or release the timed-out request's liability.

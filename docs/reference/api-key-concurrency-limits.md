# API-key concurrent request limits

Each key lineage can limit its number of unresolved dispatched requests. The
PostgreSQL policy-row lock serializes admission across gateway instances. Rotation
shares the same limit and outstanding work. Personal and paid routes use the same
control, independently of spending caps and RPM.

## Management

The [OpenAPI contract](../../contracts/key-concurrency.openapi.yaml) describes
`GET` and `PUT` at
`/admin/v1/organizations/{organization}/projects/{workspace}/keys/{key}/concurrency-limit`
and `GET .../history`. Scoped readers may inspect; owners or installation
administrators may write. Missing/out-of-scope keys return 404.

PUT requires `max_concurrent_requests` (integer 0–10,000 or explicit null) and
`expected_revision` (decimal string, initially `"0"`). Zero denies dispatch; null
removes the limit. An absent policy is unrestricted. Stale writes return 409.
Every successful configuration change appends immutable actor history. History is
descending, with `before_revision` and `limit` (1–100, default 50).

GET also returns `active_requests`, a consistent database snapshot of unresolved
dispatches across the lineage. It is available for unconfigured and revoked keys
through authorized management access. It can change immediately after the read;
admission always rechecks inside its own transaction. Policy history does not
include this live count.

The SDK exposes `getKeyConcurrencyLimit`, `setKeyConcurrencyLimit` and
`listKeyConcurrencyLimitHistory`.

## Occupancy and failures

The database checks the limit inside the dispatch transaction. It counts attempts
with a dispatch timestamp and execution state `may_have_executed`, across every
secret in the lineage. Existing unresolved dispatches count even when they predate
policy activation. Lowering the limit does not cancel work, reset occupancy or
require existing work to disappear. New dispatches wait until occupancy permits.

An exhausted limit returns HTTP 429 with type `key_concurrency_exceeded`. There is
no predicted Retry-After duration: work must finish, gain verified terminal evidence,
or an owner must change the configured limit. Configuration does not change the
execution evidence of existing work.

Confirmed completion or confirmed non-execution releases occupancy. A missing
terminal record, process restart, transport ambiguity or client disconnection does
not. This deliberately limits unresolved upstream work, rather than only counting
open HTTP connections. Uncertain requests can retain occupancy indefinitely until
resolved; the gateway does not invent completion from elapsed time. Existing
request records retain the evidence needed for diagnosis.

A video occupies a slot from initial dispatch until its execution is resolved,
including background recovery. Status/result reads and recovery polls consume no
additional slots. Already-dispatched work remains recoverable after key policy
changes. TPM is a separate unimplemented control.

Rate/concurrency rejection of an unpriced admission batch rolls back that batch
before any provider call. Individual admission fallback isolates limited keys;
ambiguous database failures are not retried automatically.

## Current-input verification (2026-10-10)

Two actual gateway listeners sharing PostgreSQL received eight simultaneous
personal model calls with a concurrency limit of one. One produced a complete
response and seven returned 429. Independent SQL confirmed exactly one dispatched
attempt and zero unresolved attempts after its terminal completion. A subsequent
call with the rotated key completed. Zero then denied dispatch, explicit null
restored a successful model call, and three policy-history rows were independently
verified. The built SDK configured the policy. Temporary keys were revoked and
the secondary listener stopped afterward.

A separate real streaming model request was disconnected after receiving initial
response bytes. SQL confirmed one unresolved dispatch. The rotated key was denied
429, and a graceful gateway restart retained the denial and unresolved record.
Temporary secrets were revoked; the uncertain attempt was preserved without a
fabricated terminal outcome.

An actual video submission with limit zero returned 429. Independent SQL confirmed
one prepared attempt and zero dispatched attempts for its key; this run did not
start an upstream video generation.

Successful video's full occupancy/recovery lifecycle, paid accounting, mixed-key
unpriced batch fallback, authorization mutation races and sustained performance
remain unverified by these runs. No fixture-test outcome supports these claims.

The live occupancy read was checked after another gateway restart against the
actual disconnected request above: original and replacement keys both returned
`active_requests: 1`, matching an independent SQL count. A newly issued,
unconfigured key returned zero. History responses omitted the live count. The
new temporary key was revoked; no additional upstream generation was submitted.

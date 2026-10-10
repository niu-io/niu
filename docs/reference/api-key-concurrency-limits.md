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
additional slots. Already-dispatched work remains recoverable while current
access permits it.
Background recovery can select an active, model-authorized replacement in the
original rotation lineage; it does not borrow an unrelated workspace key. The
selected key must still pass current model and guardrail checks. Revocation with
no eligible replacement does not fabricate task completion or release occupancy.
TPM uses a separate [estimated token budget](api-key-token-rate-limits.md).

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

Paid accounting, mixed-key unpriced batch fallback, authorization mutation races
and sustained performance remain unverified by these runs. No fixture-test outcome supports these claims.

The live occupancy read was checked after another gateway restart against the
actual disconnected request above: original and replacement keys both returned
`active_requests: 1`, matching an independent SQL count. A newly issued,
unconfigured key returned zero. History responses omitted the live count. The
new temporary key was revoked; no additional upstream generation was submitted.

## Scoped management verification (2026-10-10)

Actual owner, viewer and foreign-workspace operator credentials exercised this
policy endpoint and its history. Viewer writes returned 403; owner configuration
succeeded; repeating the old revision returned 409. The viewer could read the
configured policy and history. Foreign-workspace operator reads and writes
returned 404, including history, preserving resource-existence isolation. Even
installation access returned 404 when a real key was addressed under the wrong
workspace. Invalid history page size returned 400.

Independent SQL inspection confirmed one successful member-attributed history row
for this verification key, matching its HTTP history. Responses contained the
actor name and kind without an internal operator identifier. Temporary keys and
operators were revoked. This does not verify permission revocation racing a write.

## Video completion and rotation recovery (2026-10-10)

A new minimal personal video task occupied the one available slot. A second
submission returned 429 before dispatch. Rotating the key retained occupancy,
but the initial actual run exposed a recovery defect: the worker used the revoked
original key and stopped querying the saved job.

The worker now resolves a current key from the original rotation lineage with a
valid model grant, then applies the existing current-access and guardrail checks.
Nonterminal schedules stopped because the original key became invalid can resume
when that lineage has eligible current access. This only queries saved jobs;
it does not resubmit generation or borrow unrelated credentials.

After deploying the correction and restarting the gateway, the same saved job
completed. HTTP occupancy became zero and independent SQL returned
`confirmed_completed` with zero unresolved lineage attempts. A separate
lineage-wide SQL count confirmed exactly one dispatched generation. Its result
was 105,708 bytes, 848×480, with a decoded video duration of 1.041667 seconds.
Full FFmpeg decoding completed without errors. SHA-256:
`22994fe663364f6ed2fd7e6cd940902f443466b1f94649762feff6d28396f810`.
Temporary keys were revoked after verification. This is personal upstream-funded
execution, not evidence of prepaid customer settlement or commercial supply.

## Mixed text protocols — current-input verification

A new temporary owner-funded configuration exposed Chat/Responses and embedding
mappings under one workspace key with a concurrency limit of one. An actual Chat
request ran while an independent PostgreSQL read observed its dispatched, unresolved
attempt. Responses and embedding requests made during that occupancy each returned
429 `key_concurrency_exceeded`. After Chat completed, both protocols completed
successfully through the same key.

Response content/output and the embedding vector were inspected. Independent
database reads matched exact reported token usage for all three completed
dispatches and found zero remaining unresolved occupancy. Rejected calls added no
dispatches. The customer ledger stayed empty and the original credential revision
and ciphertext digest were unchanged. The temporary key was revoked and temporary
mappings/credential disabled.

This establishes shared occupancy and release across these three protocols on one
live gateway. It does not establish mixed-protocol multi-gateway contention, paid
admission, batch-writer behavior, sustained throughput or media settlement.
## Actual priced admission across two gateways — 2026-10-10

A separate native PostgreSQL database and two gateway processes using backend
`5a2449d` received four simultaneous requests for the same key, configured with a
concurrency limit of one. The route used real personal OpenRouter execution,
explicit internal tariffs and approved company credit. One request completed
with the exact requested structured output; three returned HTTP 429 with
`key_concurrency_exceeded`.

Independent database reads confirmed exactly one attempt and customer charge.
The debit matched integer arithmetic from the response's reported usage, no
customer reservation remained, and reconciliation reported no discrepancies.
The management occupancy read returned zero after completion. No PostgreSQL
deadlock diagnostic was observed.

Administration then set the limit to zero. Further requests were rejected before
another attempt, including after both gateways stopped and one restarted.
Temporary access was revoked, isolated processes stopped and the original saved
credential and database preserved. No external funding receipt or commercial
Supplier qualification was created.

This adds priced admission and settlement evidence for the exercised contention
scenario. It does not qualify sustained mixed workloads, in-flight policy edits
or every admission interleaving. Fixture outcomes were not used as evidence.

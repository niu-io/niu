# API-key request rate limits

Request-rate admission uses a rolling 60-second window, shared by every gateway
instance connected to the same PostgreSQL database. Secret rotation retains the
same policy and admission window. This control is independent of customer spending
caps and applies to personal routes too.

## Configuration

The [OpenAPI contract](../../contracts/key-request-rate.openapi.yaml) defines
`GET` and `PUT` at
`/admin/v1/organizations/{organization}/projects/{workspace}/keys/{key}/request-rate-limit`
and `GET .../history`. Scoped readers can inspect; scoped owners or installation
administrators can write. Missing/out-of-scope keys return 404. Required PUT fields:

- `requests_per_minute`: integer 0–1,000,000 or explicit null. Zero denies dispatch;
  null removes the limit. An absent policy is unrestricted.
- `expected_revision`: decimal string, initially `"0"`. Stale writes return 409;
  each successful write appends immutable actor history.

The SDK provides `getKeyRequestRateLimit`, `setKeyRequestRateLimit` and
`listKeyRequestRateLimitHistory`. History uses descending revisions with
`before_revision` and `limit` (1–100, default 50).

## Admission semantics

The database checks the policy at the durable dispatch transition and inserts the
window entry in that same transaction. A policy-row lock serializes admissions
across gateway instances. An exhausted positive limit returns HTTP 429, error
type `key_request_rate_exceeded`, and conservative `Retry-After: 60`. A zero
limit returns HTTP 429 with `key_request_rate_disabled` and no `Retry-After`: it
requires a configuration change; waiting does not enable it. Native protocol
error envelopes preserve the reason in `x-niu-error-code`.

Accepted dispatches consume one slot even if upstream execution later fails or
is uncertain. They expire from the rolling window after 60 seconds. This is a
request count, not a token count or a simultaneous-execution limit. Model lists,
status reads, saved results and background job polling do not consume slots.
Video creation consumes a slot at initial dispatch, not on every recovery poll.
Already-admitted work is not cancelled when a policy changes.

Counting starts when a lineage is first configured; earlier dispatches are not
retroactively counted. After configuration, null/unrestricted periods still record
admissions, so toggling null or rotating does not reset an occupied window. Old
window records are pruned on the next admission; inactive keys can retain their
last window records. Request history remains in the existing attempt records.

A definite rate-limit exception rolls back the entire unpriced admission batch.
The gateway then admits its records individually so another key can proceed.
Ambiguous database errors do not trigger this retry. Prepared personal/priced/video
attempts can remain as not-sent records on rejection; rate rejection does not imply
an upstream call or a customer charge.

## Current-input verification (2026-10-09)

Two actual gateway listeners shared the development database. Eight simultaneous
personal model requests at one request per minute produced one complete model
response and seven 429 responses with the expected error and Retry-After header.
An independent database query confirmed exactly one dispatched attempt and one
window entry. Rotating the key preserved the occupied window. The built SDK
configured the policy; stale revision, omitted limit and negative limit were
rejected through HTTP. After waiting 61 seconds, a new real model request
completed successfully and SQL confirmed pruning of the expired window entry.
Zero then rejected dispatch; explicit null restored a successful model call.
Three policy-history rows were independently verified. Temporary keys were
revoked and the secondary listener was stopped.

An actual video creation request under a zero limit returned 429. Independent
SQL inspection confirmed one prepared attempt and zero dispatches for its key.
No video generation was sent upstream by that run.

A separate actual model call occupied a one-request window, followed by a graceful
restart of the running release gateway using its existing database and encryption
identity. The next HTTP request, within that window, returned 429. Independent SQL
confirmed one admission and one dispatched attempt; restarting did not reset the
window. The temporary key was revoked afterward.

Eight simultaneous configuration writes against initial revision zero produced
one accepted update and seven revision conflicts. HTTP reads and an independent
database query agreed on the winning limit, revision one and one history row.

These initial runs do not verify paid settlement, mixed-key unpriced batch fallback,
streaming disconnects or performance under sustained configured limits. The later
priced-request checkpoint below provides separate settlement evidence. TPM and concurrent-request controls are documented separately in
[token budgets](api-key-token-rate-limits.md) and [concurrency limits](api-key-concurrency-limits.md).
Fixture outcomes are not evidence for any of these claims.

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

## Recent token-usage diagnosis

`GET /admin/v1/organizations/{organization}/projects/{workspace}/keys/{key}/token-usage-window`
returns a consistent snapshot for dispatches within the 60 seconds ending at
`window_end`. Scoped management readers can inspect it, including revoked keys.
The SDK method is `getKeyTokenUsageWindow`; the primary OpenAPI links the operation.

`requests` is split into `known_usage_requests` and `unknown_usage_requests`.
Known means both prompt and completion counts are present with provider-reported
confidence. `known_prompt_tokens` and `known_completion_tokens` are exact decimal
string subtotals of those known requests only. They are not an estimate of missing
usage. An empty window has zero counts; a window containing only unknown requests
also has zero known subtotals but a nonzero unknown count. Secret rotation shares
the window. No Supplier rates, expenses or margins are returned.

The window uses dispatch time, not completion time. Long-running work dispatched
before the window is excluded even if it completes inside it. This diagnostic is
not a TPM limiter or a reservation ledger and must not be treated as one. Migration
0209 adds a key-and-dispatch-time index for recent-history and latest-use reads.
It is a regular transactional index migration; its deployment cost on large
existing history has not been measured.

### Current-input evidence (2026-10-10)

A fresh key initially reported an empty window. One real model request completed;
a second real streaming request was disconnected after initial bytes. After key
rotation, the built SDK returned two requests, one known and one unknown, with
known token subtotals exactly matching the completed response. An independent SQL
aggregate using the response's exact `window_end` timestamp agreed. Addressing the
key under another workspace returned 404. Temporary keys were revoked and the
unknown request remained unresolved. No missing usage was filled with invented
zero-token completion evidence. These observations do not verify TPM enforcement.
## Current-input priced request verification — 2026-10-10

A separate native database and gateway running backend `5a2449d` exercised this
policy with actual personal OpenRouter calls, explicit internal tariffs and
administrator-approved credit. Management HTTP set one key to one request per
minute. After its first real completion, the next request returned 429 with
`key_request_rate_exceeded` and a `Retry-After` header.

Rotation revoked the original credential, which then returned 401. After gateway
restart, the replacement still returned 429, and an independent database read
confirmed only the original attempt existed. A separately created key in the same
workspace then completed a streamed request, demonstrating that the first key's
policy did not block the other key.

Administration explicitly removed the limit using its current revision. A stale
revision update returned 409. The formerly limited replacement immediately
completed another streamed request without restarting. After another restart,
management still reported the unlimited policy at revision 2.

All three completed requests returned the requested content and usage. Each
customer charge and debit matched independently calculated retail arithmetic;
configured procurement arithmetic was checked separately. No open reservation
or reconciliation discrepancy remained. The final database contained exactly
three attempts and charges. Temporary access was revoked and isolated processes
stopped; the original saved credential and database were preserved.

This verifies sequential admission, key isolation, rotation, restart and explicit
policy removal with actual charged traffic. It does not establish concurrent
request-rate contention, automatic window expiry, every endpoint or production
rate capacity. No fixture outcome supports this checkpoint.

## Distinguish admission paths when integrating

Personal routes prepare a durable attempt before checking dispatch limits. A
rejected personal request may therefore leave a `not_sent` attempt. Count actual
dispatches and inspect execution state when reconciling rate-limit behavior; the
total number of attempt rows is not a count of upstream calls.

The unpriced batch writer is a separate path from both personal-route preparation
and priced admission. Concurrent personal requests do not exercise its rollback
and per-record isolation behavior. A workspace with a customer balance account
rejects an unpriced shared route before admission because no qualified customer
liability bound exists. Do not remove billing protections to make that route
appear ready. Mixed-key batch fallback remains unverified by current live evidence.

## Zero-limit retry semantics — 2026-10-11

Before migration 0260, actual Chat and Messages calls with a zero key policy
returned `Retry-After: 60` and a message implying that waiting could restore
access. The dispatch triggers now distinguish zero policies from exhausted
positive windows. The distinction is made while holding the policy row lock,
not by a separate potentially stale configuration read.

A fresh isolated native run exercised zero key and zero upstream-credential
policies through Chat and Messages: all returned 429 without `Retry-After`, with
the corresponding `*_request_rate_disabled` reason. One actual personal-upstream
Chat completion then consumed a slot. Positive key and credential policies each
rejected a subsequent Messages request with the existing exceeded reason and
60-second hint. Restart preserved the zero-policy rejection behavior.

An independent verifier reopened the saved database and reconciled the received
usage against exactly one customer charge and debit at the configured internal
rates, one attempt, one admission in each policy ledger, and no unreleased
customer hold. No commercial Supplier or payment activation is asserted. This
run uses a fresh schema; populated upgrade validation is separate.

A subsequent populated upgrade check copied a stopped version-259 database with
two actual completed tool turns and customer debits, then started the current
Gateway to apply 0260. Full-row fingerprints for attempts, charges, balance
entries/reservations, encrypted configurations, models, rate policies/history,
admissions and reconciliation receipts were unchanged through another restart.
An independent verifier reopened the upgraded database and reconciled the original
response quantities to the two exact charges. Earlier migration checksums stayed
unchanged. A second stopped version-259 copy retained its already configured zero
key policy and history through upgrade, with no attempt or charge created.

The development runtime was then backed up and updated to the committed binary.
Readiness returned 200 at migration 0260; configuration-file hashes, vendor
ciphertext/revisions and organization, workspace, media-job and financial-entry
counts were unchanged. The backup archive inventory was readable; this is not a
claim that the backup itself was restored or that all release gates are complete.

## Legacy unpriced admission compatibility — 2026-10-11

The initial zero-limit change omitted the unpriced admission queue's explicit
error mapping. An actual isolated run with a legacy organization that had no
prepaid account reproduced Chat and Messages returning `503 storage_error` for a
zero key policy. New prepaid organizations reject unpriced routes earlier, so the
priced verification above did not exercise this path.

The queue now classifies zero key and credential policies as known rolled-back
admission denials and preserves their specific 429 reasons. It retains the
existing per-record handling for these explicit transactional refusals; ambiguous
storage failures still do not authorize replay. Actual Chat and Messages requests
covered both zero policies, followed by a concurrent denied request and one
permitted upstream completion. Restart preserved the denial. A separate verifier
reopened the database and matched the one actual response's usage and credential
binding to the sole attempt, with no customer account, charge, debit or hold.
The legacy organization was explicitly initialized without a prepaid account in
the disposable database; no production account or funding history was removed.
The concurrent HTTP run does not establish that both requests shared one batch.

The committed `1109707` release binary was subsequently rebuilt and installed in
the existing native development runtime. Readiness returned 200; configuration
and encryption-file hashes, vendor ciphertext/revisions, and organization,
workspace, media-job and financial-entry counts were unchanged. A fresh isolated
current-input run against that binary repeated the legacy Chat/Messages denials,
concurrent permitted completion and restart check. Independent inspection again
matched the saved response usage and credential binding to one attempt, with no
customer financial records. This checkpoint covers the legacy admission path;
it does not establish full release readiness or sustained-load performance.

## Priced admission across two Gateways — 2026-10-11

A fresh isolated PostgreSQL database and two native Gateway processes exercised
one key with a positive limit of three requests per minute. Eight simultaneous
Chat requests competed across both listeners. Three actual OpenRouter responses
contained their independently generated requested markers; five requests returned
429 `key_request_rate_exceeded` with `Retry-After: 60`. The run used explicit
internal customer rates and approved verification credit, without merchant
funding or commercial Supplier qualification. Restart preserved the policy.

Independent reopening matched the three saved response hashes and reported token
quantities to exactly three customer charges and their ledger debits, recomputing
the exact rounded amounts from the configured rates. The same three attempt IDs
were the only RPM admission entries. No customer reservation remained open and
no funding entry existed. All five saved refusals retained the expected error.
This extends the earlier personal-route checkpoint to priced admission and
reservation cleanup under cross-process contention. It does not qualify sustained
load, every protocol or settlement of uncertain upstream work.

## Priced multi-key admission across two gateways — 2026-10-11

A current-input run used a clean `8fca735` release binary, a fresh PostgreSQL 17
database and two native gateways with two admission connections each. Eight
independent workspace keys each had a two-request-per-minute cap. A synchronized
32-client burst sent four requests per key, split across both gateways, using
actual personal self-funded OpenRouter `openai/gpt-4.1-mini`. Bounded internal
approved credit and explicit customer rates exercised accounting without creating
a funding receipt or claiming commercial Supplier qualification.

Each key admitted exactly two requests and rejected two with HTTP 429
`key_request_rate_exceeded`. All 16 successful responses contained their fresh
strict-JSON marker. Restarting both gateways inside the same window preserved
the used allowance: a further request for every key returned the same 429, with
no additional attempts. Temporary keys were revoked.

Independent inspection after stopping and reopening PostgreSQL checked each raw
response hash and parsed marker, matched its reported tokens to the completed
attempt and key, and recalculated the pinned customer price. Exactly one charge
and matching debit existed per successful attempt, totaling **272,848 USD
nanounits**. All 16 successful response timings were complete. There were no
outstanding customer/procurement holds, funding receipts or live temporary keys.

This verifies the stated shared RPM boundary and accounting under a finite burst
and restart. It does not establish TPM/concurrency-cap combinations, fairness,
long-duration capacity, or every limit-window boundary. Fixture outcomes provide
no evidence for these observations.

## Natural window expiry after key rotation — 2026-10-11

A current-input run with clean `f749235`, two native gateways and fresh PostgreSQL
configured one request per rolling minute for a workspace key. One real structured
Chat completion consumed the allowance. Rotating the key made the old secret
return 401; the replacement returned 429. Restarting both gateways preserved the
429 refusal and the single admitted attempt.

The run then waited for the database clock to advance naturally beyond the first
admission's 60-second window, without editing timestamps or policy. The replacement
key completed exactly one more real request; the next call again returned 429.
Independent reopening matched both saved response hashes and fresh markers,
reported token counts, customer charges and single corresponding debits. The two
admission times were more than 60 seconds apart. Only the later admission remained
in the rolling-window table, while both completed attempts and financial records
remained durable. Both keys shared the same spending identity and unchanged
one-RPM policy/revision; the temporary replacement key was revoked afterward.

No customer hold or funding entry remained. Explicit internal rates and approved
verification credit supported this personal upstream run; it establishes no cash
receipt or commercial Supplier qualification. This covers natural window expiry
with rotation and restart, not every exact-boundary race, protocol or combined
RPM/TPM/concurrency policy.

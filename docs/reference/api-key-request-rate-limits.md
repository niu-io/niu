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
across gateway instances. Rejection returns HTTP 429, error type
`key_request_rate_exceeded`, and conservative `Retry-After: 60`. A zero limit
requires a configuration change; waiting does not enable it.

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

Paid settlement, mixed-key unpriced batch fallback, streaming disconnects and
performance under sustained configured limits are not yet verified by these runs. TPM and concurrent-request limits remain unimplemented.
Fixture outcomes are not evidence for any of these claims.

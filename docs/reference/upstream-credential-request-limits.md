# Upstream credential request limits

Each saved Supplier API credential can have an independent rolling 60-second
request cap. This protects its dispatch rate across workspaces and gateway
instances. It is separate from customer key RPM, token rates, concurrency and
spending limits; all applicable admission controls still apply.

## Configuration API

Platform administrators use these implemented endpoints:

- `GET /admin/v1/vendors/{vendor}/request-rate-limit`
- `PUT /admin/v1/vendors/{vendor}/request-rate-limit`
- `GET /admin/v1/vendors/{vendor}/request-rate-limit/history`

The policy contains `requests_per_minute` and an exact string `revision`, starting
at `"0"`. PUT requires both `requests_per_minute` and `expected_revision`. Null
means unlimited; zero denies dispatch; positive integer caps range through
1,000,000. Stale writes return 409. Omitting the limit does not clear it. Policy
updates create immutable audit history with the actor's name and time. Credential
edits preserve this separate policy and rolling window.

History is newest revision first. Use `limit` from 1 to 100 (default 50) and an
exclusive positive `before_revision` cursor. Unknown credentials return 404.
Ordinary company/workspace and Supplier membership do not grant configuration
access. Customer inference errors expose no credential identifier or procurement
configuration.

The JavaScript SDK exposes `getVendorRequestRateLimit`,
`setVendorRequestRateLimit` and `listVendorRequestRateLimitHistory`. Handler
annotations generate the OpenAPI contract. Internal vendor IDs remain API
references and must not become product labels.

## Dispatch semantics

The PostgreSQL dispatch transaction resolves the credential from immutable
managed, personal or media attempt bindings, locks its policy and checks the
current rolling window. A denied transaction does not dispatch upstream or keep
an admission slot. The gateway returns HTTP 429 with
`upstream_request_rate_exceeded` and `Retry-After: 60`. This conservative retry
hint is not a promise of future availability, especially for a zero cap.

Each committed initial dispatch counts once, including requests that later fail
or remain uncertain. A retry successor counts against its own selected credential.
Connection/model checks and video polling are not new inference dispatches.
The cap covers Niu's mapped inference dispatches, not other software using the
same upstream account. Saving the same secret as two vendor records creates two
independent policies; Niu does not infer upstream account identity from secrets.
Legacy requests without a saved credential binding have no such policy.

Unlimited dispatches also enter the window, so enabling a cap does not forget
recent work. Expired rows are removed on the next dispatch for that credential;
inactive credentials can retain their last window records. Migration backfills
recent mapped dispatches from existing attempt timestamps. No customer ledger,
price or credential ciphertext is changed. There is no automatic replay or route
substitution after local rate refusal.

## Verification boundary

Compilation and generated contracts alone do not qualify enforcement. Current
HTTP dispatches and independent database artifacts must establish cross-instance
admission, refusal cleanup, restart persistence and real elapsed-window recovery.
Video dispatch, every protocol and sustained capacity require their own evidence.


### Actual current-input evidence

Two native gateways sharing one isolated PostgreSQL database received simultaneous
credit-backed Chat requests from two workspaces using the same credential. Both
workspaces had sufficient independent procurement budgets and shared credit. A
one-request credential cap admitted one real upstream completion and refused the
other with 429 and `upstream_request_rate_exceeded`; no holds remained. A zero
cap had previously refused dispatch entirely. Restart retained the window.

An unlimited dispatch then consumed a second slot; setting the cap to two refused
another request. Waiting for the real window to expire, without editing
timestamps, admitted another real completion. Replacing the isolated credential
with an invalid key produced a real upstream 401, which consumed the next slot;
restoring the valid key did not reset that exhausted window. The three completed
requests each charged the configured internal fixed fee exactly once; the rejected
upstream request had no charge. Independent reopened-database checks matched all
three provider usage records, 3,000,000 nanounits of charges/debits, no open holds
and the persisted policy/history. No payment receipts or commercial supply
qualification were created.

Actual management calls also verified stale revision rejection, explicit-null
updates, descending history pagination, company-owner denial and SDK policy read.
Temporary operator credentials were revoked. These observations cover the
exercised Chat path, not every protocol or sustained throughput.

A separate current-input video run set a credential cap to zero. Fresh video
creates returned 429 before transport, both before and after restart. Replaying
the original idempotency key returned its existing intent with 202 and
`submission_unknown`, as the existing replay contract specifies; it did not
start a new dispatch or consume a slot. Independent reopened SQL confirmed every
attempt was still `not_sent`, with no transport spans, admissions, holds or
charges. This verifies video refusal/replay, not a positive-limit successful video
submission or customer-funded video settlement.

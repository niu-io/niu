# Upstream credential cooldown

## Contract

Migration 0234 introduces `openrouter-auth-cooldown-v1`. Three new qualified
failures observed within a rolling 60-second window cool the individual
credential for 60 seconds. Additional qualifying failures from already selected
work can extend the deadline. Successful requests do not reset this rolling
window. This is independent of credential RPM and customer key limits.

The only qualified failure is an immediate canonical OpenRouter text HTTP 401,
with the immutable `openrouter-text-auth-rejection-v1` route qualification,
unknown usage and durable `confirmed_not_executed` classification. See
[endpoint qualification](qualified-nonexecution-policy.md). Custom endpoints,
video submissions, unknown execution, timeout, transport loss, partial streams,
HTTP 500 and unqualified rate-limit statuses do not contribute. No historical
failures are backfilled.

Classification and the new cooldown observation commit in the same transaction.
Per-credential PostgreSQL row locking serializes updates across gateways.
Replaying an existing classification does not extend cooldown. Expired window
entries are pruned on the next qualifying observation; an expired deadline may
remain stored while `active` is false.

Pool selection excludes active credentials. Direct personal or shared alias
selection returns `503 upstream_credential_cooldown`; a pool without an eligible
mapping returns `503 route_pool_unavailable`. Responses do not disclose the
credential, endpoint or Supplier rates. Cooldown neither disables the customer
alias nor rewrites grants, tariffs or pinned routes. Work selected before the
cooldown can finish; video recovery and result access retain their original
route. Credential edits do not reset the state. Expiry automatically restores
eligibility without a health probe or republish.

## Administrative integration

`GET /admin/v1/vendors/{vendor}/cooldown` requires platform administration and
returns `{ "data": ... }` with:

| Field | Meaning |
| --- | --- |
| `policy_revision` | `openrouter-auth-cooldown-v1` |
| `failure_threshold` | 3 observations |
| `window_seconds` | 60 |
| `cooldown_seconds` | 60 |
| `active` | Whether the deadline is in the future |
| `cooldown_until` | Nullable timestamp; may be expired |
| `qualifying_failures` | Count in the current rolling window, not lifetime failures |

An existing credential without observations returns inactive state, zero count
and a null deadline. Unknown credentials return 404; company-scoped callers
receive 403. SDK `NiuAdminClient.getVendorCooldown` implements the same contract.
There is no write endpoint or manual reset in this policy revision.

## Current-input verification

Two gateway processes shared a fresh native PostgreSQL database and used actual
personal, self-funded OpenRouter requests. Three higher-priority credential
rejections each selected a successful lower-priority successor. Both gateways
then denied direct selection of the cooled credential, while the pool selected
only the other credential. Making that alternative ineligible returned the
explicit pool denial without creating an attempt. Replaying a recorded failure
left the deadline unchanged. Platform scope and the SDK response were checked
through HTTP.

Both processes restarted with the same state. After waiting for the actual
clock deadline without changing timestamps, selection tried the original
credential again. A separate real generation under a one-second request deadline
produced an uncertain upstream timeout and did not change that credential's
cooldown. Restart did not submit another attempt. Independent reopening of the
stopped database verified five successful response usages, four qualified
rejections, one uncertain timeout, unchanged expired deadline and no personal
customer or procurement accounting entries.

A separate current-input run began receiving a real stream, rotated only its
isolated credential to an invalid key, and recorded three new real HTTP 401s
through the second gateway. At cooldown activation the original attempt was
still in flight on that same credential. New selection returned 503; the pinned
stream continued to its terminal marker and reported usage. After restart,
independent reopening matched the raw stream usage to the completed attempt,
the same pinned credential, three distinct qualified failures and the retained
deadline. No additional attempt or financial entry appeared.

This qualifies the narrow policy, not generic failover, other Provider error
semantics, commercial supply, or performance capacity. Fixture outcomes are not
verification evidence.

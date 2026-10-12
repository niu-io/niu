# Supplier credential request-rate controls

Current-input checkpoint on clean runtime `d6304757`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This verifies local configuration control
and actual dispatch/billing, not separate upstream accounts or commercial supply.

## Contract

Platform administration manages each saved credential through
`GET/PUT /admin/v1/vendors/{vendor}/request-rate-limit` and
`GET .../request-rate-limit/history`. Existing vendor-named routes are technical
compatibility contracts; the business grouping remains Supplier.

`requests_per_minute` is null for unlimited, zero to deny dispatch or a supported
positive integer for a rolling 60-second cap. Updates require the current decimal
`expected_revision`; immutable history records successful updates. Local windows
belong to saved credential configurations, independently of customer API-key RPM.
Distinct saved configurations using one external secret do not become independent
upstream accounts. Dispatches count failures/uncertain outcomes as well; connection
checks and polling are not model dispatches. No automatic route substitution is
implied by a limit refusal.

Storage reads now use bounded read-only snapshots and updates use the shared
bounded recording transaction. Transaction-local lock waits are 250 ms and
statements two seconds. Exceeded waits return sanitized 503, not empty-success
policy/history. Failed writes do not advance the policy or append partial history.
Authorization, pool acquisition and full HTTP duration remain separate boundaries.

## Held-lock diagnosis and rollback

A stopped copy of real history contained 1,840 model requests and their customer
charges. Exclusive policy/history table locks left the preceding executable's
policy read, history read and update pending until release (approximately
1.64 seconds in those observations). The revised executable returned 503
while locks were held in **254.48, 251.95 and 253.61 ms**, respectively. Release
restored unchanged policy/history. No inference or accounting changed.

A separate actual update locked only the history table. Native diagnostics show
the update reached the audit-history INSERT before lock timeout. The response
was sanitized 503 in **256.54 ms** and the transaction rolled back its policy
update as well. Independent source/final reopening compared complete fingerprints
for policy, immutable history, admissions, encrypted credentials/models, requests
and financial tables: all were unchanged. This is exercised storage refusal and
atomic rollback, not a global deadline or latency SLO.

## Actual per-configuration dispatch

A fresh native setup used one Supplier business and two independently configured
credentials, private model mappings and customer tariffs. Both used the owner's
same personal OpenRouter key with `openai/gpt-4.1-mini-2025-04-14`. Internal
verification rates and approved credit were explicit; no commercial offer,
agreement, discount, funding receipt or independent external account was invented.

- Configuration A at zero rejected an actual inference request with 429
  `upstream_request_rate_disabled` before dispatch.
- Configuration B at one allowed an actual strict-JSON generation and rejected
  the next with `upstream_request_rate_exceeded`.
- Updating A to one preserved B's policy/history; A completed its own actual
  generation even though B's independent local window was exhausted.
- A's next request was refused, including after Gateway restart. The denials
  created no additional upstream dispatch or customer charge.
- An ordinary workspace owner could not read, modify or inspect history for
  these platform-managed controls (403). Temporary inference/management
  credentials were revoked.

The two actual successful responses produced exactly **39,631 customer
nanounits** and equal ledger debits. A separate process reconstructed original
response digests and reported usage, native attempt/credential binding, rate
revisions/history/admissions, Supplier association and exact customer charges.
There were two dispatched attempts, two charges, no funding receipts and no
open customer/procurement hold. Raw responses, credentials and confidential
configuration remain private. Original installation configuration, encrypted
identity and database were preserved through backup/isolated restore/native
refresh; authenticated registry matching remained true.

## Remaining scope

This verifies the exercised single-Gateway personal upstream workload and local
configuration isolation. It does not qualify distinct upstream accounts, every
media/protocol combination, multi-Gateway limit contention, long-window reset,
commercial Supplier earnings, frontend rendering or production capacity.

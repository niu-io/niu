# Customer balance release recovery paging

Recovery now pages at most 100 unreleased customer balance reservations before
checking attempt execution. Only `not_sent` and `confirmed_not_executed` attempts
are eligible for release. Every candidate advances traversal, including in-flight
and unknown liabilities that must remain reserved. The existing transactional
release checks remain authoritative when processing an eligible row.

Migration 268 adds a partial index ordered by attempt ID for unreleased
reservations. It complements account-scoped admission and company-scoped directory
indexes without rewriting financial records. Released history is absent from the
new index. Worker ownership, savepoints and connection use are unchanged.

## Current-input verification — 2026-10-11

A stopped database containing an actual completed upstream request with unknown
usage was copied into isolated PostgreSQL. Its one outstanding customer
reservation remained unchanged while the rebuilt Gateway applied migration 268,
advanced the balance-release worker and restarted. No ledger entry was created.
The old query returned no eligible row; the new query traversed the reservation
with `needs_recovery=false`, preserving the same eligibility decision.

Independent reopening checked the full reservation and attempt records, continued
hold, empty ledger, worker timestamp change, query hash, saved execution plans and
valid/ready partial index. Format, compilation and Clippy checks completed
separately; fixture outcomes are not evidence. The binary included shared
working-tree changes, and the original development database was not migrated by
this verification.

This first checkpoint covers retained unknown liability. A positive release case
is recorded below; the subsequent 101-admission checkpoint covers traversal of
unknown liabilities, while sustained recovery capacity remains unverified.
Other stages and customer-funded media settlement retain their
separate qualification boundaries.

## Actual nonexecution recovered after a release fault

A fresh request in an isolated copy used an intentionally invalid OpenRouter
credential and the existing explicit internal verification tariff/credit policy.
The actual upstream returned 401. Niu's narrow OpenRouter text authentication
rejection policy durably classified this request as `confirmed_not_executed`.
A temporary trigger blocked reservation release without changing that observation.

The positive reservation remained held across restart while the fault was present.
After revoking its workspace key, stopping the Gateway and removing the fault,
the restarted recovery worker released the reservation. A further restart kept
the same release timestamp. The existing ledger fingerprint remained unchanged
and this request acquired no customer charge.

Independent database reopening verified the stored upstream 401, nonexecution,
reservation amount and release timestamp, one attempt for the revoked key,
removed fault trigger and exact retained ledger fingerprint. The binary included
shared working-tree changes. No response was simulated and no funding receipt or
commercial qualification was created. This evidence applies to the explicit
OpenRouter text authentication rejection policy, not arbitrary upstream errors.

## Uncertain admission commit remains reserved

After unifying all financial recovery candidate pages, a fresh two-Gateway run
withheld PostgreSQL's successful admission COMMIT acknowledgement. The real HTTP
request returned 503 while the database retained one fully bound
`may_have_executed` attempt with unknown usage and a 1,000,000-nanounit customer
reservation. Its single-key allowance remained exhausted. A request through the
second Gateway and another after restart both returned 402 without adding an
attempt. Recovery did not release the uncertain liability.

Independent reopening verified the exact customer hold and immutable admission
bindings, one held procurement reservation, procurement budget equal to its held
amount, and no customer charge, cost entry or funding receipt. This exercises
actual HTTP admission, PostgreSQL commit-loss injection and the current worker;
no upstream response was simulated. It is not evidence of completed generation.
The binary hash is retained privately and includes shared working-tree changes.

## Actual 100+1 pending-reservation traversal

A fresh isolated run submitted 101 distinct HTTP inference admissions through two
Gateways. For each admission, a PostgreSQL protocol proxy withheld the successful
COMMIT acknowledgement. Every call returned 503, retaining its real committed
dispatch intent and unknown usage. No upstream completion was fabricated. An
advisory gate temporarily held recovery ownership while the requests accumulated.

After releasing the gate, database instrumentation recorded both balance-release
and upstream-cost stages committing a cursor at the 100th sorted attempt and then
wrapping to null after the remaining candidate. Restart retained all 101 customer
holds totaling 101,000,000 nanounits and all 101 procurement holds. The exhausted
key refused another admission with 402; no extra attempt, customer debit, cost
entry or funding receipt appeared.

Independent reopening matched query page membership exactly to the first 100 and
remaining one attempt, checked the durable cursor events, unknown execution/usage,
full held amounts and matching reserved procurement budget. The temporary key was
revoked and progress instrumentation removed. The shared-working-tree binary hash
and private artifacts were retained. This verifies traversal of ineligible unknown
liabilities, not 101 completed generations, eligible-release throughput, media
pagination or production capacity.

## Priced generation alongside the retained pending pages

A stopped copy of the 101-admission database was started with two native Gateways,
each using two admission-pool connections. A new key had a 5,000,000-nanounit cap
and the existing internal 1,000,000-nanounit request fee. Six concurrent actual
Chat requests across both Gateways produced five successful fresh-marker responses
and one `key_spending_limit_exceeded` 402. Exactly five customer charges/debits
totaling 5,000,000 nanounits were recorded, and that key's remaining allowance was
zero. The recovery stage advanced during the run.

All 101 original unknown customer and procurement liabilities remained held;
reserved procurement budget returned to its original amount after the five new
requests settled. Restart preserved those holds and five customer debits. The new
temporary key was revoked.

Independent reopening matched each response hash, fresh marker and reported usage
to its completed attempt, exact customer fee/debit and procurement cost computed
from its immutable rates. It also checked the original hold fingerprint, 106 total
attempts, no funding receipts and revoked keys. The pinned binary includes shared
working-tree changes. This is a bounded concurrent business scenario, not a
sustained throughput measurement or a global two-connection limit; dedicated
maintenance connections are separate from each admission pool.

## Shared batch-size invariant

The six candidate queries now bind their SQL limit from the worker's single
`RECOVERY_PAGE_SIZE` constant. Cursor continuation uses that same constant, keeping
the query limit and page-boundary decision from drifting apart during maintenance.
The current size remains 100; this is not an externally configurable capacity
promise.

A fresh isolated copy of the 101 actual admission records exercised all six
parameterized queries through the native worker. Newly recorded progress events
showed customer-charge, customer-balance-release and procurement stages traversing
100+1 candidates; the other stages completed their empty candidate pages. Restart
preserved every outstanding hold and the empty customer ledger. Independent
reopening checked exact page membership, new cursor events, all query hashes,
reserved procurement totals and removal of instrumentation. No synthetic attempt
or upstream completion was introduced. The shared-working-tree binary hash was
retained privately; prior limitations on throughput and commercial qualification
still apply.

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
is recorded below; more-than-100-row traversal and sustained recovery capacity
remain unverified. Other stages and customer-funded media settlement retain their
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

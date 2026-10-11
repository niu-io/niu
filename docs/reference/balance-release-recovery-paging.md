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

This is retained unknown-liability evidence, not a newly released reservation,
more-than-100-row traversal or sustained recovery capacity. Other stages and
customer-funded media settlement retain their separate qualification boundaries.

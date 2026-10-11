# Authenticated backend read-load checkpoint

## Scope — 2026-10-11

A native release gateway processed authenticated company-owner reads against an
isolated copy of 112 retained real model requests and their customer charges.
The bounded text-recovery implementation from `1db3e04` was active. No inference,
funding or financial write was submitted by the load generator.

Requests rotated evenly through these actual endpoints:

- Workspace request Logs, with a 50-record page.
- Workspace billing overview.
- Company customer-charge reconciliation.
- Workspace directory, with a 20-record page limit.

Three consecutive phases used 1, 4 and 8 concurrent clients for 20 seconds each.
The Python HTTPX client used HTTP/1.1 keep-alive over loopback, with no HTTP proxy.
Each response had to return 200 and match its saved JSON baseline, excluding only
`observed_at`. Response parsing and validation are included in client-observed
latency. The shared database pool was limited to four connections; content
retention used its separate single-connection pool. PostgreSQL session counts,
gateway RSS and financial recovery timestamps were sampled approximately every
half second.

The development host had 10 logical CPUs and 24 GiB RAM, running macOS 27.2 and
PostgreSQL 17. Other development activity was not isolated from the host.

## Observations

| Concurrent clients | Requests | Requests/second | p50 ms | p95 ms | p99 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3,273 | 163.6 | 1.59 | 19.91 | 21.56 | 33.83 |
| 4 | 9,199 | 459.5 | 2.44 | 29.24 | 32.56 | 45.27 |
| 8 | 11,488 | 574.2 | 8.08 | 35.78 | 43.44 | 65.79 |

All 23,960 responses matched their baselines. The observed peak was four shared
connections plus one content-retention connection, excluding the observer.
Financial recovery timestamps advanced through 12 distinct observations during
the load. Sampled gateway RSS ranged from 18.6 to 21.8 MiB.

The first run used an incorrect assertion that total process connections must be
at most four. Inspection identified the separate retention pool. The completed
run above sampled and checked each pool independently; it does not reinterpret
five total connections as four.

## Independent artifact checks

After shutdown, an independent process reopened PostgreSQL and checked the full
ledger fingerprint, all 112 charges/attempts and absence of open customer holds.
It matched the saved Logs page's token quantities and customer charges to durable
records, the workspace request counts to operations, and billing/reconciliation
totals to the ledger. Saved sample rows reproduced the latency percentiles,
request rates and connection bounds. Restarted endpoint reads matched the same
baselines. The tested binary and measurement artifacts were retained privately.

These are achieved rates for this short, local, authenticated read workload.
They are not a maximum-throughput estimate, sustained service-level guarantee,
long-duration memory check or qualification of inference/media/write workloads.
Larger histories, concurrent mutations and longer runs require separate evidence.
No fixture outcome supports this checkpoint.

## Follow-up: pending upstream-cost lookup

A separate current execution-plan inspection reopened the isolated database with
112 real, already-settled upstream-cost reservations. Before migration 0265, the
upstream-cost recovery query sequentially examined and filtered out all 112 rows
while returning no work. Its overall plan hit 12 shared blocks.

Migration 0265 adds an attempt-ordered partial index restricted to `state='held'`.
Applying the migration SQL to that isolated database changed the same query to an
index-only scan of the empty pending index: zero heap fetches and one shared block
for the overall plan. No query predicate, recovery cursor or settlement operation
changed. An independent process reopened the database, checked that the index was
valid and ready with the intended predicate, and compared complete reservation
and customer-ledger fingerprints with their pre-change values; both were unchanged.
The before/after JSON execution plans and fingerprints were retained privately.

This verifies exclusion of settled history for the observed empty-pending case.
It does not establish throughput for a nonempty pending queue, migration lock time
on a large installation, or deployment to the original native service. The index
uses the existing transactional migration mechanism and takes the usual index
creation lock; no concurrent online migration is claimed.

The same inspection found Supplier-earning recovery scanning 112 completed
attempts even with no bound offers. The Supplier follow-up below addresses that lookup.
The other inspected media/release queues were empty;
their empty plans do not qualify nonempty recovery or large-history performance.


## Follow-up: Supplier recovery candidate pages

Supplier-earning recovery now materializes at most 100 offer bindings before
joining attempt state and checking whether an earning is missing. All inspected
bindings advance the existing durable cursor; only eligible rows enter the
existing per-row settlement transaction. The completed-execution and reported
usage/media-pricing requirements are preserved. No new recovery worker or ledger
is introduced.

A current native run used an isolated copy of 112 real completed requests with no
Supplier offer bindings. The old lookup read all 112 attempts. The new lookup
read the empty offer index and never entered the attempts scan. The running
Supplier recovery stage advanced its persisted timestamp, and restart preserved
the complete customer-ledger fingerprint with no Supplier earnings created.
An independent process reopened the database and checked these retained plans,
query hash and durable records. This run also applied migration 0265 through the
gateway's migrator and retained its valid index across restart. Formatting,
Clippy and release compilation completed as structural checks.

The current-input verification covers the empty-offer exclusion path only.
Nonempty Supplier earnings, mixed eligible/ineligible pages, cursor traversal
across more than 100 real offer bindings, and settlement retry/restart behavior
remain unverified. This change does not qualify commercial supply or payouts.

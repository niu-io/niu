---
title: Backend text load checkpoint
description: A bounded two-gateway actual-inference measurement and its qualification limits.
---

Two native Gateway processes using clean implementation `a5f2f3b` handled 1,600
actual structured OpenRouter Chat streams on 2026-10-12. Each process configured
two admission connections and one dedicated maintenance connection. Eight
workspace keys each traversed both Gateways, with 200 requests per key and 800
per process. Thirty-two client workers offered 16 requests/second without
inference retries.

| Offered rate and implementation | Requests | Elapsed including drain | End-to-end P50 | End-to-end P95 |
| --- | ---: | ---: | ---: | ---: |
| Current 16/second, `a5f2f3b` | 1,600 | 101.35 s | 1,322.64 ms | 1,790.03 ms |
| Earlier 12/second, `268c25d` | 1,600 | 134.47 s | 1,311.44 ms | 1,692.39 ms |
| Earlier 8/second, `28bd9d0` | 1,600 | 201.59 s | 1,311.68 ms | 1,806.74 ms |

The current completed rate was 15.787 requests/second. Maximum duration was
4,551.81 ms; first-content P50/P95 were 1,135.26/1,489.06 ms. Maximum scheduled-start lag was 528.18 ms with the finite client worker pool.
Every stream
returned its fresh requested marker, native usage and `[DONE]`. These client
measurements include upstream waiting and execution; the historical runs do not isolate
the cause of timing differences.

Independent reopening of PostgreSQL and parsing of all retained streams matched
every original-rate customer charge to its debit: 26,879,148 USD nanounits.
Restart retained all attempts; no customer/procurement hold or request failure
remained, and temporary keys were revoked.

An ordinary workspace viewer separately traversed all 16 request pages and both
pages for every key filter on this current sixteen-request dataset. Full-range
summaries and CSV matched every original usage and charge. Independent reopening
re-parsed all streams and reconciled the customer rows and export against
PostgreSQL. Restart preserved the summary and byte-identical CSV. Procurement
access returned 403; foreign-workspace request/export access was denied. Readers
were revoked with no added attempt or financial entry. This verifies reporting
and isolation for the dataset, not frontend presentation or reporting throughput
under concurrent load.


A further isolated copy served 96 mixed reads through 12 workers: 32 Logs pages,
32 key-filtered pages across all eight keys and 32 complete CSV exports. All
returned HTTP 200 and no-store. Independent reopening checked each saved
response against the original streams and PostgreSQL; exact charges and debits
remained unchanged. The burst lasted 0.557 seconds, with combined client
p50/p95/maximum of 62.43/76.15/81.97 ms. This verifies a short warmed read-only
burst, not sustained reporting capacity, concurrent writes, frontend presentation
or multi-company scale.

Personal upstream access and approved internal verification credit do not imply
merchant funding or commercial Supplier qualification. Neither measurement
establishes maximum capacity, overload behavior, production SLOs, media capacity
or a matched New API baseline. No fixture outcome is evidence.

See the [full workload, historical checkpoints, independent verification and limitations](https://github.com/niu-io/niu/blob/main/docs/reference/two-gateway-text-load.md).

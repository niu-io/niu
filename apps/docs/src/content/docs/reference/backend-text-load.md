---
title: Backend text load checkpoint
description: A bounded two-gateway actual-inference measurement and its qualification limits.
---

Two native Gateway processes using clean implementation `268c25d` handled 1,600
actual structured OpenRouter Chat streams on 2026-10-12. Each process configured
two admission connections and one dedicated maintenance connection. Eight
workspace keys each traversed both Gateways, with 200 requests per key and 800
per process. Thirty-two client workers offered 12 requests/second without
inference retries.

| Offered rate and implementation | Requests | Elapsed including drain | End-to-end P50 | End-to-end P95 |
| --- | ---: | ---: | ---: | ---: |
| 12/second, `268c25d` | 1,600 | 134.47 s | 1,311.44 ms | 1,692.39 ms |
| Earlier 8/second, `28bd9d0` | 1,600 | 201.59 s | 1,311.68 ms | 1,806.74 ms |

The current completed rate was 11.899 requests/second. Maximum duration was
4,150.05 ms; first-content P50/P95 were 1,127.53/1,449.39 ms. Every stream
returned its fresh requested marker, native usage and `[DONE]`. These client
measurements include upstream waiting and execution; the two runs do not isolate
the cause of timing differences.

Independent reopening of PostgreSQL and parsing of all retained streams matched
every original-rate customer charge to its debit: 26,759,399 USD nanounits.
Restart retained all attempts; no customer/procurement hold or request failure
remained, and temporary keys were revoked.

The earlier eight-request dataset separately verified customer pagination, key
filters, full-range summaries, CSV and access isolation. Those export checks
are not asserted for the new twelve-request dataset.

Personal upstream access and approved internal verification credit do not imply
merchant funding or commercial Supplier qualification. Neither measurement
establishes maximum capacity, overload behavior, production SLOs, media capacity
or a matched New API baseline. No fixture outcome is evidence.

See the [full workload, historical checkpoints, independent verification and limitations](https://github.com/niu-io/niu/blob/main/docs/reference/two-gateway-text-load.md).

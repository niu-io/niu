---
title: Backend text load checkpoint
description: A bounded two-gateway actual-inference measurement and its qualification limits.
---

Two native Gateway processes using clean implementation `28bd9d0` handled 1,600
actual structured OpenRouter Chat streams on 2026-10-12. Each process configured
two admission-pool connections plus a dedicated maintenance connection. Eight
workspace keys each traversed both Gateways, with 200 requests per key. Thirty-two
client workers offered eight requests per second without inference retries.

| Phase | Requests | Elapsed | End-to-end P50 | End-to-end P95 |
| --- | ---: | ---: | ---: | ---: |
| Eight requests/second, streaming | 1,600 | 201.59 s | 1,311.68 ms | 1,806.74 ms |

The completed rate, including final response drain, was 7.937 requests/second.
Maximum end-to-end duration was 4,393.07 ms. First-content P50/P95 were
1,130.28/1,560.81 ms, measured at the client and including upstream waiting.
Every stream returned its fresh marker, native usage and `[DONE]`.

Independent reopening of PostgreSQL and parsing of retained SSE files matched
every original-rate customer charge to its original-account debit. The total was
26,685,801 USD nanounits. Customer and procurement reservations were released;
restart retained all attempts and temporary keys were revoked.

An ordinary customer viewer separately traversed all 16 request pages, both
pages for every key filter, full-range summaries and CSV. All usages and customer
charges matched the workload. Restart preserved the summary and byte-identical
CSV; procurement access and foreign-workspace reads/exports were denied.

Personal self-funded upstream access and approved internal verification credit
are not merchant funding or commercial Supplier qualification. These timings
include upstream execution, and this workload does not establish maximum
capacity, overload behavior, production SLOs, multi-company scale, video
performance or superiority to another gateway. No fixture outcome is evidence.

See the [full workload, historical checkpoints, independent verification and limitations](https://github.com/niu-io/niu/blob/main/docs/reference/two-gateway-text-load.md).

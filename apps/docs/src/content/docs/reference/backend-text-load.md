---
title: Backend text load checkpoint
description: A bounded two-gateway actual-inference measurement and its qualification limits.
---

Two native gateway processes, each with a four-connection database pool, handled
152 actual OpenRouter Chat completions. One phase used eight client workers for
32 requests; another scheduled 120 requests at two per second. Both gateways
shared PostgreSQL and the workload alternated evenly between them.

| Phase | Requests | Elapsed | End-to-end P50 | End-to-end P95 |
| --- | ---: | ---: | ---: | ---: |
| Eight-worker batch | 32 | 6.50 s | 1,348 ms | 2,109 ms |
| Two requests/second | 120 | 60.81 s | 1,329 ms | 1,670 ms |

All responses returned the requested current-input marker. Independent reopening
of the stopped database matched each reported usage to its pinned price, charge
and debit. The internal customer charge total was 2,553,906 USD nanounits, with
no outstanding customer/procurement holds or duplicate debit after restart.

This uses personal self-funded upstream access and internal approved credit.
It is not merchant funding or commercial Supplier qualification. Timings include
upstream execution; they do not measure gateway-only latency or production
capacity. Roughly one minute of paced traffic is not a long-duration soak.
Streaming, Guardrail detector overhead, overload and video need separate runs.

See the [full workload, independent verification and limitations](https://github.com/niu-io/niu/blob/main/docs/reference/two-gateway-text-load.md).

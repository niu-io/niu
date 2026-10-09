# Backend request-log read baseline

Date: 2026-10-09.

This measures the running local debug gateway and its existing PostgreSQL data,
not a fixture response or a paid upstream. The request was the authenticated
workspace request-history endpoint with `limit=20`. Each response contained 20
actual saved requests and 29,114 bytes. The client used fresh loopback HTTP
connections, five warm-up requests per run, closed-loop scheduling and full-body
read timing. Percentiles use nearest-rank ordering. No provider call was made.

| Concurrent clients | Requests | Wall seconds | Requests/s | P50 ms | P95 ms | P99 ms | Max ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2000 | 10.14 | 197.25 | 4.91 | 5.34 | 5.72 | 9.04 |
| 8 | 2000 | 2.328 | 859.26 | 8.83 | 12.02 | 12.95 | 14.83 |

Every measured response was HTTP 200 and its parsed JSON matched the complete
pre-run response. Independent SQL reads before and after confirmed all 20
returned attempt references exist in PostgreSQL. A final API read also matched.
Private response contents, identifiers and credentials are excluded from this
report. The private result retains a response digest and numeric measurements.
No fixture-test outcomes contribute to these observations.

These are short warm-data measurements with installation-administrator
authentication, not sustained capacity or customer-session performance.
They do not measure inference, streaming, payment settlement, Guardrail overhead,
CPU/RSS saturation, network deployment latency or larger history cardinalities.
No production rollout threshold is established from this sample. Subsequent
work must cover scoped credentials, larger pages, sustained concurrency and
resource usage before setting limits.

Measured debug executable SHA-256: `dedf1be6812b44ee361e41f829ef4d2d3ddcb519681333528a04e0a1786c49d1`.

## Scoped viewer, 30-second run

A fresh workspace-scoped viewer operator read the same current 20-row page at
8 closed-loop concurrent clients for 30 seconds. The run completed 24,898
requests in 30.009 seconds (829.68 requests/s). Full-body latency was P50 9.17 ms,
P95 12.36 ms, P99 13.72 ms and maximum 82.05 ms. Every response was HTTP 200 and
matched the complete pre-run JSON. A final read matched, and an independent SQL
query confirmed all 20 returned attempt references. Foreign-workspace reads
returned HTTP 404 both before and after the load. The temporary viewer was
revoked after measurement.

Thirty one-second `ps` samples of the listening gateway process recorded RSS
from 36,000 to 36,688 KiB, with a maximum of 36,688 KiB. Sampled CPU peaked at
537.9% (macOS multi-core reporting; approximately 5.38 cores). These process
samples exclude PostgreSQL and the load generator, and `ps` CPU is not an exact
per-request CPU cost. This is not evidence of low resource overhead: profiling
authentication and database work is needed before recommending concurrency.

The run establishes scoped-session read behavior under a bounded local load.
It does not establish long-duration stability, production capacity, wider data
cardinalities or inference throughput. No external merchant activation was
needed and no paid model generation or accounting mutation was requested.

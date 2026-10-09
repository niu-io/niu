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

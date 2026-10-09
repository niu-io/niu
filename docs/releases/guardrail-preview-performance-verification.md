# Development Guardrail preview measurements

Measured on 2026-10-07 against the running development HTTP service. This is a
preview-path checkpoint, not complete F09/F10 performance qualification.

The authenticated preview endpoints were exercised with fixed 4 KiB and 64 KiB
text, 1 and 32 absent-match local rules, concurrency 1 and 4, and three stages:
input, buffered-full output and observe-only output. Each of the 24 cases used
three warm-up calls and 20 measured calls. All **480 measured and 72 warm-up
calls** returned the expected validated synthetic result. No inference was
dispatched, policy activated, payment created or customer data modified.

Representative end-to-end HTTP latency, 64 KiB / 32 rules / concurrency 4:

| Preview | P50 ms | P95 ms | P99 ms |
| --- | ---: | ---: | ---: |
| Input | 13.851 | 19.284 | 22.064 |
| Buffered output | 19.668 | 30.931 | 31.092 |
| Observe-only output | 17.022 | 18.231 | 18.264 |

The [complete machine-readable report](evidence/guardrail-preview-2026-10-07.json)
includes request sizes, status counts, sample counts, throughput, nearest-rank
percentiles and the harness fingerprint. With only 20 observations per case,
P99 is the maximum sample, not a reliable production-tail estimate. Throughput
is measured valid results divided by each short batch duration, not a sustained
capacity claim.

The development server artifact was not pinned. These measurements include
loopback HTTP/client scheduling and the development proxy, and lack a disabled
baseline. They cannot establish added inference latency, TTFT, CPU/RSS, detector
costs, detection error rates, windowed-output behavior or rollout thresholds.
Those checks require pinned artifacts and the complete qualification matrix.

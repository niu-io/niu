# Current-input priced text concurrency measurement

Date: 2026-10-10. Gateway implementation revision: `59922df`.

This measures a previously exercised text-billing workflow with actual upstream
execution and independent financial checks. It is a short local observation,
not a production capacity qualification or a comparison with New API.

## Workload and environment

- Native macOS host, 10 logical CPUs and 24 GiB memory; one release gateway and
  a new native PostgreSQL 17 cluster. The gateway pool limit was eight connections.
  The ordinary development runtime remained running on the same host.
- Private OpenRouter mapping to `openai/gpt-4.1-mini`, internal customer/expense
  rates and bounded administrator credit as in the [credit workflow](internal-credit-workflow-live.md).
  No funding receipt, public offer or commercial Supplier qualification was created.
- Buffered Chat completions with strict JSON output, temperature zero and a
  32-token output limit. Every request had a fresh ten-character nonce in its
  prompt/schema and the same 390-byte JSON body length. Actual reported input
  usage ranged from 44 to 52 tokens and output usage from 9 to 13 tokens.
- Client thread pools issued sequential finite phases at concurrency 1, 4 and 8,
  using new loopback HTTP connections. Timings cover the whole client request,
  including upstream generation, gateway work and response transfer. No request
  was retried by the measurement script.

## Observed results

Percentiles use the nearest-rank observation within each phase. These small
samples do not estimate a production tail distribution.

| Concurrency | Actual requests | Elapsed seconds | Requests/second | P50 ms | P95 ms | Maximum ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 7.64 | 1.05 | 915 | 1,238 | 1,238 |
| 4 | 16 | 3.82 | 4.19 | 845 | 1,358 | 1,358 |
| 8 | 32 | 4.11 | 7.78 | 882 | 1,281 | 1,814 |

All 56 responses were HTTP 200 and returned the exact requested nonce in valid
structured output. Each distinct attempt had a customer charge and matching
debit equal to a separate integer calculation from client-reported usage.
The combined customer charge was **931,268 USD nanounits**; every reservation was
released, and reconciliation found no missing, mismatched, unexpected or duplicate
entries. All 56 stored response timings were complete with HTTP 200, and no
request failure or PostgreSQL deadlock diagnostic was observed in this run.
Restart preserved the same 56 charges and debits without duplication.

Sixteen one-second process samples observed gateway RSS between 22,304 and 25,728
KiB and a maximum `ps` CPU reading of 7.7%. These coarse process samples are not
peak-memory, per-core utilization or gateway-only overhead measurements.

Temporary keys were revoked, the mapping disabled and isolated processes stopped.
The original database and encrypted credential identity were unchanged. Private
evidence retains each response hash, usage, latency, charge comparison, resource
sample and binary digest. No fixture outcome supports any result here.

## Qualification boundary

The run establishes correct settlement under the stated short workload through
eight concurrent requests. It does not set a safe production concurrency limit,
demonstrate sustained throughput, isolate gateway overhead, or cover long prompts,
streaming, tool conversations, Guardrail detector overhead, video, overload,
multi-instance load or large financial backlogs. Production rollout thresholds
require those workloads and longer observations; the values above are not SLOs.

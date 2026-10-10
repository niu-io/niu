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

## Plain-text streaming follow-up

On 2026-10-10, backend `5a2449d` was exercised with the same isolated native setup
and eight-connection pool, using actual plain-text streaming requests. An initial
attempt combined strict JSON output and streaming; the gateway rejected that
unsupported combination with 501 before generation. Those observations are not
included in the generation measurements below.

The supported workload used 154-byte JSON bodies, temperature zero, a 32-token
output limit and a fresh ten-character nonce per request. The client consumed
SSE incrementally, recording the arrival of the first nonempty content delta
separately from full response completion. It required the exact requested text,
reported usage and the terminal `[DONE]` event. No retries were issued.

| Concurrency | Requests | Elapsed seconds | Requests/second | First content P50 / P95 ms | Complete P50 / P95 ms | Complete maximum ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 6.67 | 1.20 | 625 / 1,214 | 757 / 1,360 | 1,360 |
| 4 | 16 | 3.36 | 4.76 | 657 / 917 | 814 / 969 | 969 |
| 8 | 32 | 3.70 | 8.64 | 649 / 950 | 791 / 1,158 | 1,485 |

All 56 actual responses completed with HTTP 200 and the expected content. Reported
usage ranged from 13–19 input and 5–10 output tokens. Independent per-request
calculations matched every charge and debit, totaling **506,315 USD nanounits**.
No open reservation or reconciliation discrepancy remained. All 56 timing records
were complete, no request failure or PostgreSQL deadlock was observed, and a
restart preserved exactly 56 charges and debits. Fourteen one-second samples
observed gateway RSS between 22,192 and 25,616 KiB.

This adds short plain-text streaming evidence, including customer accounting,
through eight concurrent calls. The latency includes upstream execution and is
not gateway-only overhead; the first-content measurement is client-observed,
not the provider's internal token-generation time. It does not qualify sustained
load, slow readers, long streams, streaming structured output or production
capacity. Temporary access and isolated processes were cleaned up, and the
original database and encrypted credential identity were preserved.

## Longer fixed-concurrency streaming run

A further current-input run on 2026-10-10 used backend `5a2449d`, the same
154-byte plain-text streaming workload, a separate native PostgreSQL database,
one gateway with an eight-connection pool, and four concurrent clients issuing
512 requests without retries. The request phase lasted **116.38 seconds**.

Observed throughput was 4.40 requests/second. Client-observed first-content
latency was P50 682 ms / P95 1,296 ms; complete-response latency was P50 826 ms /
P95 1,444 ms, with a maximum of 3,736 ms. These nearest-rank measurements include
upstream execution. Every response was HTTP 200, contained the exact fresh
requested nonce, reported usage and ended with `[DONE]`.

Two independent database snapshots during the run showed 93 attempts / 89 charges
and 308 attempts / 304 charges, each with four open reservations. After all
responses completed, every one of the 512 customer charges and debits matched
an independent calculation from that response's usage. No reservation or
reconciliation discrepancy remained. All 512 timing records were complete,
with no request-failure record or PostgreSQL deadlock diagnostic. Restart
preserved exactly 512 charges and debits. Temporary access was revoked and the
isolated processes stopped; the original database and credential were unchanged.

This extends continuous short-request observation to roughly two minutes at four
concurrent streams. It is not a soak test, a production capacity ceiling or a
gateway-only benchmark; long-lived streams, slow readers, overload and mixed
workloads remain outside this measurement.

The exact customer debit total was 4,580,415 USD nanounits at the configured
internal verification rates. Reported usage ranged from 13–19 input and 5–10
output tokens. Across 115 one-second process samples, gateway RSS ranged from
22,272 to 25,520 KiB and ended at 23,248 KiB; the maximum `ps` CPU reading was
8.1%. These samples do not establish peak memory or absence of a long-term leak.

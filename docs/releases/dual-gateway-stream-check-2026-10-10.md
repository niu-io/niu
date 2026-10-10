# Dual-gateway streamed admission checkpoint

This is a bounded current-input check of the implemented streamed admission path,
not complete backend acceptance or a production capacity benchmark. No fixture
outcome is used as evidence.

## Workload and independent artifacts

Two optimized gateway processes shared the existing PostgreSQL database and
identity. A temporary owner-funded OpenRouter mapping enabled Chat and Responses,
with a single temporary workspace key configured for two concurrent requests.
Four rounds each offered eight simultaneous streamed requests, alternating Chat
and Responses and distributing requests across both gateways. Rounds were separated
by ten seconds. Output was bounded to 16 tokens per request; there were no retries.

The run offered 32 requests: eight completed and 24 returned
`key_concurrency_exceeded`. Completed requests included both gateway instances.
Every completed HTTP terminal usage total matched its independently queried
PostgreSQL attempt. The database contained exactly eight upstream dispatches for
the key, so the rejected requests did not submit additional upstream work. It had
no remaining `may_have_executed` attempt for this key after each round.

An independent interval-overlap query over persisted dispatch/completion timestamps
found maximum overlap two. This supports the shared key occupancy limit for this
observed workload; it is not a proof over arbitrary schedules or clock failures.

| Completed request duration | Observed milliseconds |
| --- | ---: |
| Minimum | 779 |
| Upper middle observation | 1228 |
| Maximum | 1338 |

Durations were measured at the client from request submission through stream
consumption and include upstream generation/network latency. With only eight
completed calls, no tail percentile, throughput ceiling or gateway-only service
time is claimed. Protocol-specific duration and success distributions were not
retained in this checkpoint.

No customer ledger mutation occurred. The original credential's revision and
ciphertext digest were unchanged. The secondary process exited, the temporary
workspace key was revoked, and its personal mapping/credential were disabled.
OpenRouter remains personal testing supply, not qualified commercial procurement.

## Remaining qualification

Customer-funded concurrent reservation/debit/refund, Supplier settlement,
long-running load, larger databases, sustained saturation, fault recovery under
contention and a controlled New API comparison remain open. Prior actual
single-request cancellation and output-limit checks cover different lifecycle
boundaries and do not turn this workload into complete financial qualification.

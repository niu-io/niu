# API key spending-cap contention

## Actual burst — 2026-10-11

Two native Gateway processes shared an isolated PostgreSQL database, one company,
two workspaces and eight API keys. Each Gateway's admission pool was configured
for two connections; separate maintenance connections are not included in that
limit. The build contained the current backend changes from the shared working
tree, not a clean release artifact. The original development database, service
and encrypted identities were untouched.

Each workspace contained four keys. Each key permitted exactly 2,000,000 USD
nanounits of customer commitment. The explicit internal customer tariff charged
1,000,000 nanounits per request and zero per-token rates. Workspace limits and
approved company credit exceeded the possible admitted commitment, so they did
not mask key-cap enforcement. This uses internal credit and personal OpenRouter
access, with no funding receipt, commercial Supplier qualification or discount.

A client barrier released 64 simultaneous Chat requests, eight per key, split
across both Gateway processes. Sixteen returned actual GPT-4.1-mini completions
containing their independently generated requested markers. The other 48 returned
402 `key_spending_limit_exceeded`. Every key admitted exactly two requests. No
request returned 5xx in this run.

| Client-observed result | Count | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Actual completion, HTTP 200 | 16 | 1,371.6 ms | 3,665.7 ms | 3,665.7 ms |
| Key-cap rejection, HTTP 402 | 48 | 158.1 ms | 177.7 ms | 181.2 ms |

Percentiles use nearest rank within each result group. With only 16 successes,
p95 equals the observed maximum. Successful latency includes upstream generation
and client transfer; it is not Gateway processing latency. Burst wall time was
3.677 seconds, including client worker startup and result collection.

Fourteen process samples at an intended 250 ms interval observed maximum CPU
readings of 8.9% and 7.9% and maximum RSS of 26,720 and 25,696 KiB for the two
Gateway processes. These are sampled process readings, not CPU-time averages,
memory ceilings, database resource measurements or sustained-capacity estimates.

## Settlement and independent verification

After settlement and Gateway restart, there were exactly sixteen attempts and
sixteen charge debits totaling 16,000,000 nanounits. No customer reservation
remained open. Every key had zero remaining allowance; company balance was
-16,000,000 nanounits and available credit was 84,000,000. Verification keys were
revoked after the final reads.

A separate process reopened the stopped database, rehashed the sixteen actual
completion responses and inspected all 48 saved refusal responses. It matched
markers, provider-reported usage, key/workspace attribution and pinned customer
fees to exactly two charges/debits per key. There were no funding entries, extra
attempts or open holds. Independent commitment calculations reproduced all key
allowances, and recorded latency percentiles and sampled RSS maxima were
recomputed from the saved observations.

This qualifies the observed fixed-fee key-cap burst and exact settlement after
restart. It is not a maximum-throughput result, a sustained-load result, a New API
performance comparison or evidence for variable-token reservations, streaming,
media billing, external funding or generic overload behavior. See the separate
[layered-limit run](layered-spending-limits.md) for workspace and company refusal
and approved-credit recovery.

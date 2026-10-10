# Five-minute mixed-key text run

Current-input native verification, 2026-10-11. This is a scoped stability and
accounting observation, not production capacity or complete backend acceptance.

One isolated gateway with an eight-connection PostgreSQL pool used eight
independent workspace API keys. The client scheduled 600 actual non-streaming
personal OpenRouter Chat requests at two requests per second, with eight workers.
Each requested a fresh unique marker under a strict JSON schema and a 32-token
output bound. Every HTTP response was 200 and delivered its requested marker.
No fixture supplied an upstream response.

| Observation | Result |
| --- | --- |
| Actual completed requests | 600, 75 per API key |
| Run through restart verification and key revocation | 300.95 seconds |
| Client request round-trip p50 | 1,378.26 ms |
| Client request round-trip nearest-rank p95 | 1,980.29 ms |
| Maximum client request round-trip | 4,172.44 ms |
| Reconciled customer verification charges | 10,054,403 USD nanounits |

After gateway restart, independent reopening of PostgreSQL matched every
response's reported usage to its completed attempt and API key. Each charge was
recalculated from the pinned customer tariff. Exactly 600 balance debits matched
their own charge's amount, currency, company and workspace; their sum matched
the total above. No customer reservation remained held. Temporary keys were
revoked and isolated processes stopped. Existing development data and encrypted
identity were unchanged.

Customer rates and approved credit were internal verification inputs, not an
external payment, Supplier agreement, discount or measured upstream expense.
These small bounded outputs do not qualify long outputs, streaming, media,
overload, slow readers, multi-gateway capacity or a long soak. Scheduling at a
fixed offered rate does not measure maximum throughput. Coarse process samples
are not peak resource measurements or proof against leaks. No comparison with
New API performance is established.

Twenty-eight process snapshots, sampled every ten seconds during part of the
run, observed at most 32.22 MiB RSS and 2.5% CPU in the platform's `ps` reading.
Sampling began after requests started and ended when the original gateway
process exited for restart; these values exclude unobserved intervals and
PostgreSQL resources.

## Follow-up at five scheduled requests per second

A separate current-input run on 2026-10-11 used the same bounded non-streaming
workload, eight keys and one gateway, with sixteen client workers and a scheduled
rate of five requests per second. All 600 actual OpenRouter responses returned
HTTP 200 and their unique requested markers; each key completed 75 requests.

| Observation | Result |
| --- | --- |
| Workload duration, excluding restart and key revocation | 121.07 seconds |
| Achieved completion throughput over that duration | 4.956 requests/second |
| Maximum client start delay relative to schedule | 12.00 ms |
| Client request round-trip p50 | 1,325.74 ms |
| Client request round-trip nearest-rank p95 | 1,703.73 ms |
| Maximum client request round-trip | 3,308.12 ms |
| Reconciled customer verification charges | 10,085,384 USD nanounits |

Gateway restart preserved all attempts. Independent reopening of the stopped
database verified all 600 completed attempts against their response usage and
key, recalculated every customer charge, and matched all 600 balance debits by
amount, currency, company and workspace. No customer reservation remained held.
Temporary keys were revoked and isolated processes stopped.

This run had no resource sampler. Its shorter duration and external upstream
variability prevent interpreting the latency difference as a performance
improvement. It establishes this offered workload only, with the same internal
credit and tariff boundaries above; it does not establish maximum capacity,
streaming latency, video performance or complete release readiness.

## Customer reporting across the complete five-RPS history

A separate isolated copy of that stopped database exercised the customer request
APIs with an ordinary workspace-viewer session. Six 100-entry pages contained
exactly the original 600 attempts without duplicates or omissions. Every page's
full-range summary matched all reported input/output tokens and the total
customer charge of 10,085,384 USD nanounits. Each of the eight key filters returned
its own 75 attempts and matching filtered count.

The customer CSV contained all 600 rows, with reported token counts and customer
charges matching the persisted attempts. Restart produced a byte-identical
export. API entries and summaries omitted the checked procurement/credential
fields, CSV headings did not expose procurement categories, and the viewer's
procurement-cost API request returned 403. Revoking the viewer session changed
subsequent request-list access to 401.

Independent reopening reconciled every original response's usage, key and exact
charge against the database, saved customer API rows and exported CSV. Aggregate
totals matched, financial counts and sums were unchanged, no reservation remained
held, and the temporary reporting session was revoked. This is actual backend
pagination, filtering, aggregate and export evidence for the exercised text
history, not browser Logs/Usage acceptance, media reporting or unrestricted
large-history capacity. The original development database and source evidence
were unchanged.

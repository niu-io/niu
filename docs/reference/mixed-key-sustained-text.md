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

# Two-gateway priced text load checkpoint

Date: 2026-10-11. Backend implementation through `f75908a`; main integration
`a0cd865`. This extends the [single-gateway measurement](priced-text-concurrency-live.md)
with a current-input two-process run. It does not qualify production capacity or
establish a comparison with New API.

## Workload

- Native macOS, 10 logical CPUs, 24 GiB RAM, PostgreSQL 17, two release gateway
  processes sharing one fresh database. Each gateway allowed four database
  connections. The ordinary development services remained running on the host;
  CPU and network capacity were not isolated.
- Actual OpenRouter `openai/gpt-4.1-mini` buffered Chat completions, using the
  owner's personal self-funded account. Internal customer and procurement rates
  and bounded approved credit exercised accounting. No commercial offer,
  Supplier qualification, funding receipt or external payment was fabricated.
- Each 390-byte request asked for its own fresh ten-character marker under a
  strict JSON schema, with temperature zero and a 32-token output limit. Actual
  input usage ranged from 43 to 54 tokens and output from 9 to 14 tokens.
- A 32-request phase used eight client workers. A second phase scheduled 120
  requests at two per second, with the same eight-worker upper bound. Requests
  alternated gateways: each process served 76. The client made no retries.
- Before credit was approved, an actual admission returned 402 with no attempt.
  Temporary keys were revoked and the mapping disabled after qualification.

## Observations

Latency is whole-request elapsed time, including upstream generation and
response transfer. Percentiles use nearest rank over each finite phase.

| Phase | Requests | Elapsed seconds | Completed requests/second | P50 ms | P95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Eight-worker batch | 32 | 6.50 | 4.92 | 1,348 | 2,109 | 2,339 |
| Scheduled at two requests/second | 120 | 60.81 | 1.97 | 1,329 | 1,670 | 2,082 |

All 152 responses returned HTTP 200 and the requested marker. Their reported
usage independently calculated to **2,553,906 USD nanounits** of internal customer
charges. Reopening the stopped database independently verified 152 dispatched,
completed attempts, 152 complete response timings, the reported token counts,
the pinned rates, and exactly one matching charge and debit per attempt.
Customer and procurement holds were no longer outstanding. The reconciliation
API matched the independent total, and restart produced no duplicate charge.
No request failure, funding receipt or live temporary key remained.

One-second process sampling collected 66 observations per gateway. RSS ranges
were 22,672–32,336 KiB and 16,592–32,512 KiB; maximum observed `ps` CPU readings
were 6.7% and 3.1%. These are coarse samples, not peak resource measurements or
proof of bounded memory under sustained production traffic. No PostgreSQL
deadlock diagnostic occurred in this run.

The first independent inspection used a nonexistent release-time column for
procurement reservations. It was corrected to inspect the actual `state='held'`
contract and rerun against the same stopped database; no inference was repeated
for that verifier correction. The original development database, configuration
and encrypted identity were unchanged. Private artifacts retain responses,
usages, timings, resource samples, reconciliation and the release binary digest.
No fixture outcome supports these observations.

## Limits and next qualification

This is approximately one minute of paced traffic after a short concurrent
phase, not a long-duration soak or saturation test. It qualifies the stated
internal-credit text workflow through two gateway processes, not merchant-funded
prepaid operation, Supplier settlements, video billing or every Provider. It does
not isolate gateway overhead, set an SLO or determine a safe production worker
count. Streaming, long prompts, detector-enabled Guardrails, saturation/overload
and longer resource observations still need their own current-input runs.

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

## Small-pool, mixed-key concurrency follow-up

A separate current-input run used clean commit `8fca735` on 2026-10-11,
two gateways with two admission database connections each, and one dedicated
content-maintenance connection per gateway. Eight workspace keys each crossed
both gateways. The same actual upstream, strict JSON marker and bounded internal
credit approach described above applied. No client retries were made.

| Client workers | Requests | Elapsed seconds | Completed requests/second | P50 ms | P95 ms | Maximum ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 32 | 11.52 | 2.78 | 1,316 | 1,668 | 7,670 |
| 16 | 64 | 6.04 | 10.60 | 1,344 | 1,634 | 1,978 |
| 32 | 128 | 6.70 | 19.11 | 1,327 | 1,645 | 3,236 |

All 224 responses were HTTP 200 with their requested marker. Independent
inspection of the stopped and reopened database verified each saved raw response
hash, parsed output and reported usage against completed attempts, pinned prices,
and exactly one customer charge and matching debit. The total was **3,759,016 USD
nanounits**. Each key accounted for 28 calls; each gateway served 112. All 224
response timings were complete. There were no outstanding customer or procurement
holds, request failures, funding receipts or live temporary keys. Restart did not
duplicate charges; the reconciliation API independently matched the total.

These short, closed-loop phases demonstrate this particular accounting path
under concurrent small-pool access. They do not establish sustainable throughput,
saturation capacity, a production SLO, or a causal explanation for the first
phase's latency outlier. Upstream and host variability remain included. Streaming,
long-duration load and media settlement need separate verification.

## Sustained mixed-key small-pool run

A subsequent current-input run used clean commit `22d3780`, two gateways with two
admission connections each, and eight independent keys. It scheduled 1,600 actual
OpenRouter requests at five requests per second with sixteen client workers.
Each key completed 200 calls across both gateways; each gateway served 800.
The strict-JSON marker, 32-token output bound, personal upstream account and
internal approved-credit/rate boundaries above remained in force. There were no
client retries.

| Observation | Result |
| --- | ---: |
| Request phase duration | 321.36 seconds |
| Completed requests/second | 4.979 |
| Whole-request P50 | 1,310 ms |
| Whole-request nearest-rank P95 | 1,639 ms |
| Maximum whole-request duration | 3,764 ms |
| Verified HTTP 200 responses with their requested marker | 1,600 |
| Exact internal customer charges, USD nanounits | 26,740,990 |

Independent reopening of the stopped PostgreSQL database verified all saved raw
response hashes and parsed markers, matched reported tokens and key attribution
to 1,600 completed attempts, and recalculated every pinned customer charge. Each
attempt had exactly one matching debit; all successful response timings were
complete. Reconciliation matched the independent total. No customer/procurement
hold, request failure, funding receipt or live temporary key remained. Restart
did not duplicate charges. The original development database and identity were
unchanged.

The one-second sampler obtained 314 observations per gateway. Observed RSS ranged
from 23,152 to 32,736 KiB and from 16,768 to 32,080 KiB, ending at 29,680 and
28,720 KiB. Maximum sampled `ps` CPU was 4.6% for each process. These coarse
samples exclude PostgreSQL and do not prove the absence of leaks or capture
unobserved peaks. Host and upstream capacity were not isolated.

This extends the earlier short concurrent phases to approximately five minutes
of paced multi-instance traffic. It establishes the stated text-accounting run,
not a long soak, maximum throughput, production SLO, streaming/media capacity or
performance superiority over New API. No fixture result supports this evidence.

### Customer reporting beyond 1,000 actual records

A stopped copy of the 1,600-request database was served by the same clean
`22d3780` binary with a workspace-scoped viewer. Sixteen 100-entry request pages
contained every original attempt exactly once. Each page returned the same
full-range counts, reported tokens and exact 26,740,990 USD-nanounit customer
total. Filtering each of the eight keys and traversing both pages returned its
own 200 attempts and corresponding full filtered count.

The customer CSV contained all 1,600 records. Its token/charge rows matched the
saved HTTP responses and database, and the export remained byte-identical after
restart. The checked procurement and credential fields were absent from customer
rows, summaries and CSV headings; the procurement-cost endpoint returned 403.
Revoking the viewer made subsequent reads return 401. Independent reopening
reconciled the saved pages and CSV against every original reported usage, key,
pinned charge and debit. Reporting left attempts and financial totals unchanged.

The first verifier requested a 1,000-entry filtered page and received the correct
400 because the request-list maximum is 100. The verifier was corrected to follow
100-entry cursors; no new inference was required. This is evidence for the
observed API/export boundary beyond 1,000 real rows, not browser qualification,
concurrent pagination mutation semantics or reporting capacity at arbitrary scale.

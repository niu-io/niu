# Two-gateway priced text load checkpoint

## Current sustained stream checkpoint — 2026-10-12

Digest-verified clean implementation `28bd9d04014ad817bda2f62a8aa0071071a418b1`
ran two Gateway processes against fresh native PostgreSQL 17 on schema 278. Each
Gateway had two configured admission connections plus its dedicated maintenance
connection. Eight workspace keys each traversed both processes, with 200 requests
per key and 800 per Gateway. Thirty-two client workers scheduled 1,600 actual
structured Chat streams at eight requests/second using personal OpenRouter access
and fresh output markers, without inference retries.

All streams returned their marker, native usage and `[DONE]`. Including final
response drain, the workload took **201.59 seconds** and completed **7.937
requests/second**. End-to-end elapsed p50/p95 were **1,311.68/1,806.74 ms**;
maximum elapsed was **4,393.07 ms**. First-content p50/p95 were
**1,130.28/1,560.81 ms**, measured at the client and including transport and
upstream waiting. Maximum scheduled-start lag was **15.49 ms**.

Across 774 coarse process samples, maximum Gateway RSS was **34,368/33,072 KiB**
and maximum sampled `ps` CPU was **7.0/7.4 percent**. These are process samples,
not CPU profiles or PostgreSQL/whole-host accounting. No maximum-capacity or
memory-leak conclusion follows from them.

After restart, independent database reopening hashed and parsed every retained
SSE response, matched all request/key/model associations and completed timing
records, and recomputed each charge using pinned internal customer rates. Exactly
**26,685,801 USD nanounits** of customer charges matched original-account debits.
Customer and procurement reservations were released, no request-failure record or
funding receipt was present, and all temporary keys were revoked. Customer streams
contained no procurement-cost or encrypted-credential fields.

This extends sustained text streaming/accounting evidence beyond the earlier
30-second workload. It does not establish an eight-completion/second minimum,
maximum capacity, overload behavior, production SLOs, multi-company scale, media
performance or superiority to New API. Personal self-funded access and approved
internal verification credit are not commercial supply or external payments.
Original databases, configuration and encrypted identity were unchanged; no
fixture outcome is evidence.

### Customer reporting against the sustained stream dataset

A current-input HTTP run copied the stopped 1,600-stream database and used the
same digest-verified implementation. An ordinary workspace viewer traversed all
16 request pages, read the full-range summary and traversed both filtered pages
for each of eight keys. Each key retained exactly its 200 original requests;
there were no omissions or duplicates. Native token totals and the
**26,685,801 USD-nanounit** customer-charge total matched all customer rows and
CSV exports. Installation and customer responses agreed on these customer values.

Customer serialization contained no procurement prices, Supplier expenses,
margins, upstream endpoint or encrypted credentials. The procurement API returned
403 to the viewer. An unrelated company/workspace reader was denied request data
and export without receiving original attempt identities. The saved artifacts
retain the observed denial statuses.

Restart preserved an identical full-range summary and byte-identical CSV.
Revocation subsequently returned 401. Independent PostgreSQL reopening parsed
and hashed the original SSE files again, recomputed every bound-rate charge, and
matched the saved API rows and CSV to original keys and account debits. Reporting
introduced no inference or financial entry; original workload evidence and the
native development installation remained unchanged. This verifies these populated
backend reporting and isolation paths, not frontend presentation, reporting under
concurrent writes or broader tenant capacity. No fixture outcome is evidence.

## Earlier committed 8-request/second stream checkpoint — 2026-10-12

Digest-verified clean committed Gateway
`1b209f7fb1472b914a7ce69c2a47951b7fb83c0b` ran two processes against one
fresh native PostgreSQL database, with two configured admission-pool connections
per process plus the existing dedicated maintenance connections. Eight distinct
keys each crossed both Gateways. The driver scheduled 240 genuine structured
Chat streams at 8 requests/second with 32 client workers. Every response returned
its fresh marker, native usage and `[DONE]`, without an inference retry.

The workload, including final response drain, took **32.63 seconds**, yielding
**7.355 completed requests/second**. End-to-end elapsed p50/p95 were
**1,318.27/1,721.30 ms**, with a **3,405.38 ms** maximum. First-content
p50/p95 were **1,146.05/1,506.29 ms**; maximum scheduled-start lag was
**11.17 ms**. Gateway maximum sampled RSS was **33,904/32,720 KiB**,
and maximum sampled `ps` CPU percentages were **5.7/7.3** respectively. These
coarse process samples exclude PostgreSQL and whole-host resource accounting.

Independent reopening parsed and hashed all retained SSE responses, checked all
240 stored request/key attributions and complete timings, and recomputed each
charge from native token counts and pinned internal customer rates. Exactly
**4,011,486 USD nanounits** of charges matched equal original-account debits.
All customer/procurement reservations were released; no funding receipt was
created. Restart retained all attempts and temporary keys were revoked.

This extends actual clean committed text/accounting verification to the higher
offered rate. It does not establish a sustained 8 completed requests/second,
maximum capacity, long-soak stability, production SLOs, cross-company scale, media
capacity or a causal comparison with the older/different-revision checkpoint or
New API. Personal self-funded OpenRouter access and approved internal credit/
rates do not establish commercial supply or externally funded payments. Original
databases, configuration and encrypted identity were unchanged. No fixture
outcome is performance or business evidence.

### Customer reporting after this workload

A separate actual HTTP run copied the stopped 8-request/second workload database
and used the same digest-verified `1b209f7` binary. An ordinary scoped viewer
traversed all three request pages and read the full-range summary, all eight
key filters and CSV export. Each key returned its 30 original requests; all
240 usages and the **4,011,486 USD-nanounit** customer-charge total agreed.
Installation and scoped customer responses preserved the same financial boundary.
No Supplier expenses, purchase rates, margins or credential fields appeared.
The separate procurement API returned 403 to the viewer; an unrelated company/
workspace reader received 404 for request data and export.

Restart preserved byte-identical CSV and summary data, and revocation denied
the temporary reporting session. Independent reopening parsed and hashed the
original actual SSE responses again, recomputed every bound-rate charge and
matched each customer API/export row to its original key and database debit.
No inference, ledger entry, funding receipt or reservation was introduced by
reporting. The source workload and original native runtime were unchanged.
This qualifies these populated read/export and authorization paths, not
concurrent-write pagination, multi-company capacity or frontend presentation.
No fixture outcome is evidence.

## Actual streaming checkpoint (2026-10-12)

A separate current-input run used committed gateway
`35b80454633826f88a3e913a1fa19a30a73fc98d`, verified by its retained binary
digest, with schema 278 in a fresh isolated PostgreSQL 17 database. Two native
Gateway processes shared that database. Each configured its admission pool to two
connections; dedicated maintenance connections are additional, so this is not a
four-connection total limit. Existing development services remained running.

The owner's personal OpenRouter account supplied `openai/gpt-4.1-mini`. Eight
workspace keys each called both processes. Sixteen client workers scheduled 240
streaming Chat requests at four per second, without retries. Each request used a
fresh strict-schema JSON marker and a 32-token output limit, with streamed usage
enabled. Explicit internal customer prices and approved internal credit exercised
accounting; no commercial offer, merchant funding or Supplier qualification was
claimed. Before granting credit, an actual request returned 402 with no attempt.

| Requests | Workload seconds | Completed requests/second | End-to-end P50 ms | End-to-end P95 ms | Maximum ms | First-content P50 ms | First-content P95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 240 | 60.99 | 3.935 | 1,299.75 | 1,659.24 | 3,238.63 | 1,122.41 | 1,404.99 |

End-to-end duration runs from starting the HTTP request through reading the
complete SSE response. First-content time ends at the first event with nonempty
content. Both include upstream and network time. P50 is the median and P95 uses
nearest rank. Maximum scheduled-start lag was 10.16 ms.

After restarting both Gateways and revoking temporary keys, a separate process
reopened the stopped database. It independently rehashed and parsed every raw SSE
artifact, checked the requested marker, usage and `[DONE]`, and matched all 240
completed attempts to their keys and pinned token prices. Each Gateway handled
120 requests; each key accounted for 30 and crossed both processes. Exactly one
customer charge and one matching debit in the original bound account existed per
attempt, totaling **4,026,681 USD nanounits**. All 240 response timings were
complete. There were no recorded failures, outstanding customer or procurement
holds, funding receipts, or live temporary keys. Customer stream objects contained
none of the checked procurement-cost or encrypted-credential fields.

Half-second process sampling retained 232 observations across both Gateways.
Maximum sampled RSS was 33,184 and 32,320 KiB; maximum `ps` CPU readings were
5.2% and 5.0%, respectively. These are coarse process samples, not interval CPU
profiles, PostgreSQL resource measurements, or peak-resource guarantees.

This adds actual two-Gateway streaming and accounting evidence for the stated
small-pool workload. It is approximately one minute of traffic, not a saturation
test, long-duration soak, production SLO, cross-product performance comparison,
commercial Supplier settlement or paid-media qualification. No fixture outcome
supports these observations. The original database, configuration and encrypted
identity were unchanged.

### Customer reporting and isolation for the streaming run

A separate native reporting run used the same committed binary on a stopped copy
of the actual 240-request database. An ordinary workspace reader traversed all
three request-history pages at a page size of 100. Every exposed key, token count
and customer charge matched its stored attempt. Complete-range summaries remained
identical across pages; all eight key filters returned their own 30 requests.
Full-range token and charge totals covered all 240 requests, including rows beyond
the first page. CSV export matched their usage and customer amounts.

The reader's procurement-cost request returned 403. A reader scoped to a different
organization and workspace received 404 for both request history and CSV export,
without revealing any of the tested attempt identifiers. Customer response objects
and export columns contained none of the checked procurement, credential or margin
fields. After restarting the reporting Gateway, the CSV was byte-identical.
Revoking the reporting reader changed its history request to 401; both temporary
readers were revoked.

A separate process reopened this stopped reporting database, rehashed and parsed
the original source SSE artifacts, recomputed the charges from their reported
usage, and matched every saved API row and exported record to the database. The
total remained **4,026,681 USD nanounits**. Attempt, charge and balance-entry counts
and ledger totals were unchanged by reporting; no new inference or financial
posting was needed. This verifies the stated backend reporting and authorization
paths for this actual dataset. It does not qualify dashboard rendering, reporting
under concurrent inference load or every filter combination.

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

## Concurrent reporting reads — 2026-10-11

A clean `4c3a980` gateway opened an isolated copy of the same 1,600 actual-request
database, with two admission connections. A workspace viewer read
`GET /admin/v1/organizations/{organization}/projects/{project}/requests?limit=100`.
Each response included the first 100 records and full-range usage/customer totals.
After one reference read, sequential short bursts produced:

| Concurrent clients | Reads | Duration (seconds) | Reads/second | Client P50 (ms) | Client P95 (ms) | Maximum (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 32 | 0.562 | 56.89 | 16.16 | 18.94 | 22.56 |
| 8 | 128 | 1.058 | 120.93 | 63.77 | 81.85 | 85.76 |
| 16 | 256 | 2.093 | 122.31 | 127.65 | 150.28 | 172.55 |

All 416 reads returned HTTP 200, `no-store`, and identical parsed content.
Independent reopening of the stopped database matched the retained response's
full counts, tokens and exact charges, plus each of its 100 request rows. Reader
revocation returned 401 afterward; attempts, charges and ledger totals remained
unchanged. No upstream calls or cash receipts were generated by this read run.

These are loopback client timings with a warmed, small retained dataset, one
gateway and a two-connection admission pool. The near-equal throughput of the last
two bursts is an observation, not attribution to a particular bottleneck. This
short read-only workload does not establish sustained capacity, concurrent-write
behavior, other query shapes, larger datasets, production latency or an SLO.

## Page and summary consistency during admission — 2026-10-11

Request-list rows and full-range summaries now share one read-only repeatable-read
transaction. Previously the summary committed its snapshot before the page query,
allowing a single HTTP response to describe different populations. The existing
selection and aggregate queries now accept the same connection; no second pool
connection, persistent cursor transaction or schema migration is introduced.
Cross-page traversal remains a live view, as documented in OpenAPI.

An actual HTTP run against a copy of the retained history held a relation lock
while the report computed its summary. A newly configured personal OpenRouter
route admitted one real structured completion before the reader resumed. Before
the fix, the response reported 1,600 requests but included the new request in its
page. After the fix, that response consistently excluded the later request from
both the page and its 1,600-request summary; the subsequent read counted 1,601.
Independent reopening matched the saved upstream response and token quantities,
the final attempt population and the retained report. The original 1,600 customer
charges remained unchanged; the new owner-funded request produced no customer
charge. The first verification attempt used a previously disabled route and did
not establish the intended interleaving; it was replaced with the fresh route.

This verifies one-response consistency under actual admission, not a frozen
multi-page report or every concurrent settlement/update interleaving. The docs
build and served OpenAPI were checked separately; no frontend visual acceptance
is claimed.

## Bounded reporting database waits — 2026-10-11

Activity list/summary, detail and CSV export reads now share a read-only transaction
setup with transaction-local `lock_timeout = 1s` and `statement_timeout = 5s`.
These limits bound a lock wait and each SQL statement, respectively; they do not
promise a five-second HTTP deadline across pool acquisition and multiple queries.
A cancelled query rolls back the read transaction and returns the existing safe
503 storage error, without an empty success or partial report. Settings do not
persist beyond the transaction. Expensive reports may now fail explicitly and
require a narrower filter instead of holding a connection indefinitely.

On an isolated copy of the 1,600 actual-request database, an independent session
held a relation lock needed by reporting. The prior binary continued waiting
through a two-second hold and returned only after release. With the change, the
list request completed with 503 while the lock was still held. Detail and export
requests separately returned 503 in approximately 1.004 and 1.005 seconds. Each
endpoint returned 200 again after lock release. An independent process reopened
the stopped database, matched three PostgreSQL lock-timeout events to retained
safe HTTP errors, and confirmed unchanged attempts, charges and ledger totals.

This verifies lock refusal and subsequent recovery against real retained data.
The five-second execution-timeout branch, larger histories and sustained mixed
inference/reporting capacity remain unverified. No inference was submitted by
this reporting run.

## Mixed inference and reporting — 2026-10-11

Clean committed `f749235` was run with one gateway and two admission connections
on an isolated copy of the 1,600-request history. The existing internal verification
mapping and its independent customer tariff were re-enabled through management
APIs. Four report readers continuously requested 100-row activity pages while
32 real structured Chat requests were scheduled at four per second, with at most
eight inference workers. The original development database remained unchanged.

The workload completed in 9.090 seconds. All 32 upstream responses returned the
fresh requested marker, and all 1,055 report reads returned HTTP 200. Client
inference P50/P95/maximum were 1,434.66/1,714.70/1,790.50 ms; report values were
33.74/36.49/45.50 ms. These measurements include local HTTP client overhead.

Independent reopening matched every retained raw inference response and hash,
reported tokens, key attribution, pinned customer rates, exact charge and single
balance debit. The 32 additional debits totaled 531,376 USD nanounits. Final
history contained 1,632 attempts, charges and charge entries, with no open customer
holds or funding entries. Recorded report IDs belonged to that workspace's retained
attempts; the final full-range report reconciled and remained identical after
restart. The temporary inference key and report reader were revoked afterward.

This is a short mixed-workload correctness and latency checkpoint, not a sustained
SLO, maximum capacity, multi-gateway contention or a causal latency comparison.
It uses personal upstream access and explicit internal verification credit/rates;
it establishes no received cash, discounted commercial supply or Supplier payout.


## Current Gateway sustained customer reporting — 2026-10-12

Clean committed `039960a` ran one isolated Gateway with two admission database
connections against a stopped copy of the actual 1,600-request history described
above. An ordinary workspace viewer repeatedly read the first 100 request rows
and their full-range server summary. Sixteen client workers scheduled 1,200 reads
at 20 requests per second. This run generated no upstream model requests or new
charges and did not modify the original installation.

| Observation | Result |
| --- | --- |
| Completed report reads | 1,200, all HTTP 200 with no-store |
| Scheduled rate / completion rate | 20 / 20.009 reads per second |
| Measured workload duration | 59.973 seconds |
| Client round-trip p50 / nearest-rank p95 / p99 | 17.391 / 28.976 / 150.130 ms |
| Maximum client round-trip / scheduling lag | 258.988 / 18.951 ms |
| Maximum sampled Gateway RSS | 21,232 KiB |
| Maximum sampled Gateway CPU | 8.2% from macOS ps |
| Resource samples | 117, approximately 500 ms intervals |

Every response matched the saved current-input reference, including all 1,600
request/usage/customer-charge totals rather than only the loaded page. Response
hashes were retained for every read. Gateway restart preserved the report; reader
revocation returned HTTP 401. Financial counts and sums were unchanged.

Independent reopening matched all 100 returned rows and full-range totals to
stored attempts and customer charges. A separate check parsed and hashed all
1,600 original retained upstream responses, matched key attribution and pinned
retail rates, recomputed every charge and equal ledger debit, and confirmed their
26,740,990 USD-nanounit total. No active customer/procurement hold or funding
receipt appeared. Independent arithmetic also reproduced the percentiles and
resource maxima from the saved measurement samples. No fixture outcome is
performance or business evidence.

This is a warm-history, read-only, one-Gateway checkpoint on the exercised local
deployment. It does not qualify maximum capacity, production SLOs, cold-cache or
multi-company scale, concurrent writes, long-soak stability or a causal latency
comparison. CPU/RSS samples cover the Gateway process, not PostgreSQL or the
whole host. The historical actual model calls used personal upstream access and
internal approved credit/rates, not commercial Supplier qualification or funds.

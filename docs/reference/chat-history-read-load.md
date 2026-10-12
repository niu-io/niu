# Paced reads of actual saved Chat history

Current-input checkpoint on clean backend `8363ae3`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This is a scoped read workload, not
production capacity, mixed inference qualification or a New API comparison.

## Workload

A stopped copy of actual history retained 1,840 model requests and exact customer
charges. An ordinary workspace owner saved 101 distinct actual response
conversations through the current API. One Gateway used two admission database
connections and the existing bounded Chat read snapshots. No new inference was
dispatched; customer charge hydration used the original actual attempts.

Eight requester slots offered **20 reads/second**: **1,200 successful reads**,
alternating 600 first-page and 600 continuation-page reads, with 50 rows each.
Every original response body matched its reference byte-for-byte. The first
page was 23,630 bytes; continuation was 23,619 bytes. The timed phase completed
in **59.966 seconds**, approximately **20.011 completed reads/second**.

| HTTP duration | All reads | First page | Continuation |
| --- | --- | --- | --- |
| p50 | 4.783 ms | 4.620 ms | 4.943 ms |
| p95 | 6.434 ms | 6.211 ms | 6.605 ms |
| p99 | 7.339 ms | 7.253 ms | 8.037 ms |
| Maximum | 9.862 ms | 9.557 ms | 9.862 ms |

Percentiles use nearest-rank ordering of retained monotonic HTTP durations.
Maximum requester start lag was 10.569 ms. These durations include local
authorization, storage, charge projection and response transfer; they are not
Provider or database-only timings. PostgreSQL and the requester shared the
local machine with the Gateway.

There were 118 coarse process samples at roughly half-second intervals. Maximum
observed Gateway RSS was **19,680 KiB**; maximum sampled `ps` CPU was **6.5%**.
These process samples do not measure PostgreSQL, requester or full host resources,
do not establish sub-sample peaks, and are not precise interval CPU utilization.

## Independent final-artifact checks

A separate process reopened the stopped database and reconstructed both page
payloads, ordering, next cursors and exact charge hydration from native rows.
All 1,200 retained response digests/statuses/sizes matched the original reference
bytes; response index and page assignment were complete. Full fingerprints for
saved sessions, attempts, customer charges and ledger, funding, reservations and
Supplier earnings matched the pre-load snapshot. Existing customer charges and
debits remained unchanged; no model call, funding receipt or new charge occurred.

Restart returned identical pages. The temporary owner's revocation denied reads
and was confirmed independently in native state. Original installation data and
encrypted identity were preserved; raw response content, timings and credentials
remain private.

## Cursor portability found during verification

The preceding implementation fingerprinted timestamp text. An independent
reader using the database's local time zone produced a different digest from
the Gateway's UTC session for the same unchanged row. No page data changed.
The read workload itself completed successfully; its initial native cursor
comparison needed the actual UTC rendering rather than an assumed local format.

New cursor fingerprints now hash epoch values, independent of session time zone.
A fresh ordinary-owner upgrade run saved five actual responses, captured the
preceding executable's UTC-text cursor and replaced it with `8363ae3`. The old
cursor continued successfully, while newly returned cursors used the new
fingerprint. Restart preserved both continuations. Updating the cursor row
made both old and new stale cursors return 409.

Native checks in UTC, Asia/Shanghai and America/New_York produced the same epoch
digest. Independent final reopening verified saved/page contents, changed native
state, equivalent current digests in all three zones, revocation and unchanged
request/financial fingerprints. The timed workload above was rerun after this
change; it reports the final executable, not the preceding one.

## Remaining scope

This does not establish saturation, multi-Gateway reads, mixed inference/Chat
write behavior, large-attachment throughput, concurrent mutations, every old
deployment's custom timestamp rendering or a production SLO. The 32 MiB saved
body bound has [separate content-preservation evidence](chat-history-size-bound.md).
Frontend paging and complete Chat/release acceptance remain open.

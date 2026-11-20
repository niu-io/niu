# Current-data database reliability verification — 2026-11-17

Tracking: `niu-9rqz`, related `niu-3t8t.8` and `niu-3t8t.7`. Hosted core was
`2ec290daa4525a3277c3e49dae46395674a9ac96`. The relevant query and transaction
changes were introduced by `91add9805e070b7325453c3da5ebe41d9c357cb5`.
This run verifies that repair with actual current data. Fixture outcomes in older
records are disregarded and are not part of this acceptance.

## Diagnostic access correction

Native SSH authentication remained unavailable. A temporary single-client /32
external database rule allowed a bounded read-only PostgreSQL connection. Each
session restored the exact original empty access list and independently read it
back. Credentials and raw query plans remained outside the public repository.

The first probe was invalid: it fetched an empty external connection URI before
allowlisting and psql attempted a local socket. That result does not establish a
remote connection failure. The corrected probe fetched the URI after allowlisting,
validated the remote hostname and set explicit connection parameters. PostgreSQL
17.11 reported `transaction_read_only=on`. Diagnostic statements were bounded;
no business rows, schema, prices or financial policies were changed.

## Reproduced slow-query mechanism

Executed the historical enrichment SQL from the parent of `91add980` and the current
SQL against the same actual 153-key workspace. Both used the application's two-second
statement limit for the concurrent comparison. Three concurrent historical reads
produced one completion at 1,605 ms execution and two statement timeouts. Three
current reads all completed: planning 378–614 ms, execution 8–497 ms. Successful
historical execution touched 7,365 shared-buffer blocks versus 451 for each current
execution. These are bounded observations, not production throughput guarantees.

The old query repeatedly evaluated per-root financial/policy subqueries. The current
query aggregates those inputs across the selected roots. The current snapshot helper
also disables JIT and protects transaction begin/commit cleanup from caller
cancellation. JIT did not appear in these plans, so this run does not attribute the
observed query improvement to JIT.

A separate repeatable-read transaction compared both query outputs over the same
153 current keys. Financial amounts, configured limits and other policy fields
matched. Differences were observation timestamps and active-request counts. An
independent database read identified 27 attempts with recorded upstream HTTP failures
that the historical projection still counted as active. The current projection
excludes these failures, consistent with the separately repaired concurrency reader;
it preserves uncertainty about upstream execution rather than relabeling outcomes.

## Hosted behavior and independent observations

Four installation-authorized batches each concurrently read keys, requests and
chats; all returned 200. Each key read returned 153 records. A real member browser
then executed three concurrent batches of keys, requests, chats, assets and models.
All 15 returned 200, recovering 153 key records, 50 request records, four chats,
one asset and 97 models. Member request durations were 430–2,206 ms. The different
chat counts under the installation credential and member session were not treated
as lost data: saved conversations remain member-scoped.

The actual browser rapidly switched among Models, Logs and API keys three times,
then refreshed keys and inspected the populated page without an error alert.
Following saved generation history recovered the paid video with readyState 4 and
no media error. This is current-input navigation/recovery evidence, not a mocked
loading or failure screen.

The complete filtered control-plane query from 14:35 to 15:41 UTC returned no
gateway request 5xx entries and no database process-termination entries, with no
remaining page. It returned two database statement timeouts at the timestamps of
this run's controlled historical-query comparison. Those are diagnostic failures,
not failed hosted requests.

Historical memory metrics around the previously recorded process termination
reached 267,558,910 of 268,435,460 bytes, approximately 99.7%. This supports memory
pressure as an explanation for that interruption; it is not a kernel OOM receipt.
The current 14:35–15:45 UTC sample peaked at 243,798,020 bytes and ended at
123,674,620 bytes. No service plan or database capacity was changed.

## Acceptance boundary

The previously identified key-query timeout is reproduced by the old SQL and the
current implementation completes the same bounded current-data workload. Hosted
concurrent reads and navigation recovery confirm the affected user journey works.
This supports closing the tracked query/loading repair. It does not certify every
future workload, provide a production SLA or prove the precise cause of every
historical infrastructure interruption. Final promotion still requires the accepted
release candidate and its remaining payment, distribution and capability gates.

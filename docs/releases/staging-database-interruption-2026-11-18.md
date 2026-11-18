# Current staging database interruption — 2026-11-18

Tracking: `niu-mvhk`, reopened `niu-9rqz`; preview admission `niu-5zx0`.

Complete provider log queries for 00:18–00:35 UTC contain four HTTP 503 responses:
two database pool-acquisition timeouts around 00:24, one Video content rejection
at 00:26:54, and one key-list SQL timeout at 00:31:01. The 121 health/readiness
responses in that queried window were HTTP 200. Successful sampled probes do not
invalidate the recorded user-request failures.

The database log independently reports a process killed by signal 9 at 00:23:54
while reading SQL migration metadata. Recovery accepted connections at 00:24:09.
A 30-second memory sample reached 249,311,230 of 268,435,460 bytes near that
interruption, falling to approximately 49.7 MB afterward. This supports a capacity
concern but does not identify the signal sender or establish a kernel OOM event.
The Video content rejection remains distinct from the storage timeouts.

The later key-list failure has SQLSTATE 57014 and the current aggregate enrichment
query, rather than its historical predecessor. The previously closed query finding
was reopened. On the actual current 181-key data, a bounded read-only plan took
125.7 ms planning and 9.9 ms execution. Three concurrent current-query reads took
503.8/297.1, 701.7/201.8 and 158.7/301.2 ms planning/execution respectively. These
successful reads do not explain away the real timeout or prove sustained capacity.
Financial calculations and admission limits were not changed. Each temporary
single-client database access rule was restored to the original empty list and
independently checked afterward.

The core database currently has 256 MB RAM. A reviewable proposal increases only
that instance to 1 GB, preserving storage, version and data. Published compute
pricing is $6/month versus $19/month, an increase of $13/month; storage is separate.
[Render pricing](https://render.com/pricing) and
[compute-plan change behavior](https://render.com/docs/compute-plans) were checked.
A plan change involves brief downtime. Explicit approval for this recurring cost
has been requested because the approved video-test budget does not cover it.
No capacity change has been applied. Subsequent acceptance must correlate database
stability with actual authenticated concurrent journeys, not readiness probes alone.
Fixture outcomes provide no evidence.

## Further current-input recurrence

A subsequent 00:40–00:47 UTC complete provider window contains fourteen HTTP 502
and twelve HTTP 503 responses. Twelve application storage failures are pool waits
on saved-task and diagnostics reads. The database log records another process
killed by signal 9 at 00:44:01. This independently corroborates the browser's renewed
gateway/session failures; repeated successful readiness reads are insufficient.

The interrupted acceptance attempted the unquoted confirmation flow with the
currently priced Wan route, a two-second 720p input and an actual temporary
output-metadata change. No confirmation submission occurred. Independent scoped
request inventory was zero. The original capabilities and pricing were restored
using optimistic revision protection (revision 2 to temporary 3 to restored 4),
the temporary credential was revoked and independently denied, the matching draft
was cleared and read back, and the browser signed out. No paid generation was
created. Successful unquoted execution remains unverified and depends on resolving
this service instability; this attempt does not qualify Seedance or erase prior
configured-Wan evidence.

## Hosted recovery window after the next deployment

The complete 01:24–01:33 UTC provider window for core `6fb59ef2` contains five
custom-domain HTTP 503 responses: four video-content reads and one workspace
key-list read. Thirty-two sampled readiness requests returned 200. Application
logs independently record a readiness storage I/O failure at 01:25:38 and a
key-list database statement timeout (SQLSTATE 57014) at 01:29:50. The latter
matches the browser's temporary key-unavailable state during response recovery.
These observations do not establish another database process termination; that
requires a separate database-log correlation. Successful retry and completed
video artifacts do not resolve either the storage timeout or preview rejection.

The preview admission correction has since entered the integration branch at
`fd1ec05d`; its exact hosted acceptance remains separate. No database capacity
change has been made while approval for recurring cost is pending.

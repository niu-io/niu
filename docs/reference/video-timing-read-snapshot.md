# Video timing diagnostics: bounded read snapshot

Current-input checkpoint on clean backend `e1d4325`, reviewed 2026-10-12.
Fixture outcomes provide no evidence.

## Contract

`GET /v1/video/jobs/{id}/timings` and the authorized dashboard bridge at
`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/timings`
return the existing customer-safe timing and lifecycle projection. After the
existing job/access check, the latest 100 transport spans and lifecycle
observations now share one bounded read-only snapshot. Response fields,
chronological ordering and `has_more` semantics are unchanged.

Transaction-local storage limits are 250 ms for lock waits and two seconds for
statements. Storage failure maps to a sanitized 503, rather than an empty-success
response. These limits do not bound pool acquisition, preceding authorization,
the complete HTTP request or every video operation. Gateway observation times
are not exact Provider queue/run durations.

## Actual verification

A stopped copy of a newly completed actual personal video provided six native
submission/query/result transport spans and two lifecycle observations. A newly
issued no-expiration workspace key and an ordinary workspace viewer read the
same projection through the public and dashboard endpoints. No generation or
upstream query was initiated by this verification.

An independent session held an exclusive lock on the transport timing table.
The previous executable left both reads pending until lock release (1,640.59
and 1,643.15 ms in those observations). The revised executable returned 503
while the lock remained held, in 259.53 ms for the public endpoint and 256.19 ms
for the dashboard endpoint. Release restored the exact saved projection.
Restart preserved both reads; revoking the reader key and viewer denied access.
These observations establish the exercised lock-refusal behavior, not a
production latency SLO or load capacity.

A separate process reopened the stopped database. It independently reconstructed
all six transport spans and lifecycle ordering/timestamps from native rows,
checked sanitized error artifacts and the native lock-timeout diagnostic, and
compared complete fingerprints for attempts, jobs, lifecycle observations,
transport records, query evidence, submission identities and financial tables.
They remained unchanged; the original submission count was one and both reader
identities were revoked. Raw artifacts and credentials remain private.

This checkpoint does not qualify concurrent lifecycle mutations, every access
revocation interleaving, upstream generation timing, paid-video metering or all
background-worker connection isolation.

# Hosted follow-up — 2026-11-18

Tracking: `niu-nrcn.4`, `niu-mvhk`. This dated evidence does not establish final
release acceptance. Fixture outcomes are not used.

## Current-input text request

After the deployment platform confirmed core
`9fd281e523cdbd521585a0a8f98d605d5d5a1073` live, an extracted development SDK
used a fresh 15-minute credential restricted to `qiniu/conatus-free`. An
independent key read confirmed a USD zero spending cap; current published
customer token rates, request fee and minimum charge were all zero.

The first nonstreaming request returned HTTP 429 with an upstream-error response.
No inference retry occurred, and the planned streaming, tool and cancellation
steps were not executed. Independent scoped request inspection found exactly one
record, `run-1089`: `may_have_executed`, upstream HTTP 429, unknown usage, null
customer charge and `not_charged`. This establishes a failed current attempt,
not successful inference or the cause of the Provider response. The temporary
credential was revoked with HTTP 204 and independently denied with HTTP 401;
its plaintext token was removed.

An earlier TCP connection timeout occurred during credential creation. Before
recovering, an independent administrative inventory found no matching new key.
That timeout is distinct from the subsequent acknowledged Provider rejection.

## Network-path evidence

Read-only workstation inspection confirmed a current automatic proxy policy
with a local HTTP/SOCKS proxy and direct fallback. Retained service logs showed
the actual browser taking the proxy path to staging. Historical application logs
near the original 502 incident contain generic parse errors without destination
correlation; retained service logs do not cover that incident. These observations
do not identify its failing hop.

A controlled comparison explicitly selected direct and proxy connections to
both the custom domain and deployment hostname, with three reads per combination.
All 12 current health requests returned HTTP 200 in 0.81–1.03 seconds. No proxy,
DNS or service configuration was changed during this investigation. Current
health does not prove a causal repair of the historical 502, so `niu-mvhk`
remains open.

## Retained provider-side evidence for the historical 502

A new read-only provider-log investigation covers the complete interval
2026-11-13 17:18–17:28 UTC (2026-11-14 01:18–01:28 CST). Pagination was exhausted
for each query. This changes the earlier interpretation: a local proxy alone
cannot explain failures that the hosting provider independently recorded.

The provider request logs contain 18 HTTP 502 and 20 HTTP 503 responses on the
custom domain. The health-only subset contains 103 requests: 90 HTTP 200 and
13 HTTP 502. Complete application health logs contain 90 HTTP 200 completions.
Every successful provider health response is within 0.8 milliseconds of an
application completion; no failed response is within 100 milliseconds of one
(the nearest differences range from 240 milliseconds to 15 seconds). Request
identifiers differ between these log layers, so this is timestamp correlation,
not an identity join. The evidence locates the observed 502 in provider request
serving without a matching application completion; it does not establish the
reason for the difference between custom and service hostnames.

The same interval contains 15 application readiness failures and database pool
acquisition failures. Independently retrieved database logs show a server process
terminated by signal 9 at 17:20:09 UTC, interrupted-database recovery, rejected
connections during recovery, and readiness to accept connections at 17:20:30.
The sender and reason for the signal remain unidentified; no OOM claim follows.

The service uses `/readyz` and one instance. Render documents removal from routing
after 15 seconds of failed checks and restart after 60 seconds. Readiness-driven
routing withdrawal is consistent with the timeline, but remains an inference.
See [Render health checks](https://render.com/docs/health-checks). The database
failure mechanism and its verified query repair are recorded separately in
[database reliability verification](database-reliability-verification-0.3-2026-11-17.md).

For the current hosted core, complete provider queries covering 2026-11-17
19:15–19:58:23 UTC found no HTTP 502/503/504 and no durable-storage-operation
failure messages. Fourteen recorded health/readiness requests returned HTTP 200.
Actual authenticated actor-isolation and revocation flows completed in this
interval; see [current security isolation](current-security-isolation-2026-11-18.md).
These are bounded recovery observations. Exact accepted-candidate recovery and
final release qualification remain required under `niu-mvhk` and `niu-nrcn.1`.

## Exact Chat candidate deployment

Core `3f949559156ff2499a900e6890b3e29ed6ed4dde` reached the live staging
state with its pinned website composition. Independent custom-domain reads of
`/healthz` and `/readyz` returned HTTP 200. All 27 asset URLs recorded from the
previous live dashboard still returned HTTP 200 with identical byte counts and
SHA-256 digests. Actual authenticated Chat invocation and saved-state recovery
then completed; see [Chat key recovery](chat-key-recovery-2026-11-18.md).
These observations establish this deployment and bounded journey, not sustained
availability or completion of the remaining release cases.

## Post-deployment observation

Complete provider log queries from 2026-11-17 20:27 UTC through 20:38:03 UTC found 60 health/readiness responses, all HTTP 200, no
HTTP 502/503/504 responses, and no durable-storage-operation failure messages.
Pagination was exhausted. Actual custom-domain Chat invocation, saved-state
recovery, protected workspace deletion, video estimate recovery and native
client invocation were exercised on this deployed core. These observations
bound the current recovery evidence; they do not establish uninterrupted future
availability or identify the sender of the historical database termination.

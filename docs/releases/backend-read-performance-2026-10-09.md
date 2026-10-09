# Backend request-log read baseline

Date: 2026-10-09.

This measures the running local debug gateway and its existing PostgreSQL data,
not a fixture response or a paid upstream. The request was the authenticated
workspace request-history endpoint with `limit=20`. Each response contained 20
actual saved requests and 29,114 bytes. The client used fresh loopback HTTP
connections, five warm-up requests per run, closed-loop scheduling and full-body
read timing. Percentiles use nearest-rank ordering. No provider call was made.

| Concurrent clients | Requests | Wall seconds | Requests/s | P50 ms | P95 ms | P99 ms | Max ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2000 | 10.14 | 197.25 | 4.91 | 5.34 | 5.72 | 9.04 |
| 8 | 2000 | 2.328 | 859.26 | 8.83 | 12.02 | 12.95 | 14.83 |

Every measured response was HTTP 200 and its parsed JSON matched the complete
pre-run response. Independent SQL reads before and after confirmed all 20
returned attempt references exist in PostgreSQL. A final API read also matched.
Private response contents, identifiers and credentials are excluded from this
report. The private result retains a response digest and numeric measurements.
No fixture-test outcomes contribute to these observations.

These are short warm-data measurements with installation-administrator
authentication, not sustained capacity or customer-session performance.
They do not measure inference, streaming, payment settlement, Guardrail overhead,
CPU/RSS saturation, network deployment latency or larger history cardinalities.
No production rollout threshold is established from this sample. Subsequent
work must cover scoped credentials, larger pages, sustained concurrency and
resource usage before setting limits.

Measured debug executable SHA-256: `dedf1be6812b44ee361e41f829ef4d2d3ddcb519681333528a04e0a1786c49d1`.

## Scoped viewer, 30-second run

A fresh workspace-scoped viewer operator read the same current 20-row page at
8 closed-loop concurrent clients for 30 seconds. The run completed 24,898
requests in 30.009 seconds (829.68 requests/s). Full-body latency was P50 9.17 ms,
P95 12.36 ms, P99 13.72 ms and maximum 82.05 ms. Every response was HTTP 200 and
matched the complete pre-run JSON. A final read matched, and an independent SQL
query confirmed all 20 returned attempt references. Foreign-workspace reads
returned HTTP 404 both before and after the load. The temporary viewer was
revoked after measurement.

Thirty one-second `ps` samples of the listening gateway process recorded RSS
from 36,000 to 36,688 KiB, with a maximum of 36,688 KiB. Sampled CPU peaked at
537.9% (macOS multi-core reporting; approximately 5.38 cores). These process
samples exclude PostgreSQL and the load generator, and `ps` CPU is not an exact
per-request CPU cost. This is not evidence of low resource overhead: profiling
authentication and database work is needed before recommending concurrency.

The run establishes scoped-session read behavior under a bounded local load.
It does not establish long-duration stability, production capacity, wider data
cardinalities or inference throughput. No external merchant activation was
needed and no paid model generation or accounting mutation was requested.

## Sampling and persistent-connection comparison

A five-second macOS stack sample during another scoped read run showed routing
service clone/drop work and JSON construction/serialization among active stacks.
The sample also includes idle waits and SQLx work; recursive frame counts are
not CPU percentages. It does not establish authentication or PostgreSQL as the
bottleneck. The profiled run is excluded from latency comparisons because the
profiler perturbs scheduling.

A separate unprofiled run kept one HTTP connection per worker instead of opening
one per request. With the same viewer scope, page and eight workers for 30.009
seconds, it completed 31,011 requests (1,033.39 requests/s): P50 7.02 ms, P95
10.04 ms, P99 18.67 ms and maximum 48.53 ms. Thirty gateway process samples
recorded peak CPU 495.1% and RSS from 37,536 to 38,048 KiB. All response documents
matched, SQL confirmed the same 20 references and foreign-workspace reads still
returned 404 before and after. The temporary operator was revoked.

Connection reuse increased observed throughput and reduced median/P95 in these
runs, but P99 was higher than the earlier fresh-connection run. These sequential
samples are not a controlled repeated causal estimate. The remaining debug-build
CPU cost still needs profiling; no backend optimization or production capacity
claim follows from this comparison. Future reports must state connection reuse
explicitly rather than conflating per-connection work with steady-state reads.

## Eager router finalization

Inspection of the installed Axum implementation identified a concrete connection
cost: serving `Router` directly calls `self.clone().with_state(())` for each
incoming connection. `into_make_service()` performs that finalization once when
constructing the service. The gateway entry point now uses this explicit service
conversion, retaining the same router, layers and graceful shutdown.

After compilation and a graceful restart using the existing database/encryption
configuration, the same eight-client fresh-connection run completed 30,498 reads
in 30.009 seconds (1,016.31 requests/s). Latency was P50 7.37 ms, P95 10.12 ms,
P99 11.41 ms and maximum 127.54 ms. Thirty process samples recorded peak CPU
485.0% and RSS from 31,616 to 39,552 KiB. All response documents matched;
independent SQL confirmed the returned references and foreign-workspace access
remained HTTP 404. The maximum latency and startup memory growth prevent a
blanket claim of uniformly lower latency or steady memory consumption. These
sequential development measurements are not a production capacity estimate.

Post-restart business checks also exercised the built administration SDK's saved
video replay: owner access succeeded, viewer/foreign scope and missing model
grants were denied, changed input conflicted, and database submission counts
stayed unchanged. An actual personal streaming model request completed and its
persisted usage/timing record was independently read. Temporary keys and operators
were revoked. Compilation and formatting were checked; no fixture outcome is
used as evidence for this change.

## Repeating request-history measurements

Use `scripts/request-read-benchmark.py` against an existing workspace containing
saved requests. Supply a short-lived scoped viewer credential through
`NIU_BENCHMARK_TOKEN` in the process environment, never as a command argument.
For example, after setting the environment privately:

```sh
python3 scripts/request-read-benchmark.py \
  --endpoint 'http://127.0.0.1:2567/admin/v1/organizations/ORG_UUID/projects/WORKSPACE_UUID/requests?limit=100' \
  --concurrency 8 --seconds 30
```

Replace the URL placeholders with the workspace's API identifiers. The tool only
accepts the request-history route with an explicit page limit of 1–100, or
`/requests/ATTEMPT_UUID` without query parameters for one saved request. Detail
responses must contain the requested attempt identity. It does
not follow redirects, generate inference, or print response contents, workspace
identifiers or credentials. Default connection reuse is per worker; pass
`--fresh-connections` to measure new connections. Run against a quiescent scope:
new requests or changing diagnostics cause response mismatches and a nonzero
exit, not silently accepted timing samples. A worker stops on transport/status/
parsing failure without retry. Reads have a ten-second socket timeout and a
4 MiB response bound, so an in-flight read can finish after the admission window.

The JSON report contains full-body latency for matching responses, separate
error/mismatch counts and observed throughput. Empty baseline pages are rejected.
The comparison is against a current API read, not a fixture; independent database
or artifact verification is still required before accepting the returned data.

The committed tool was exercised with a new scoped viewer against the running
post-change gateway at `limit=100`: the existing workspace held 29 returned rows,
not a fabricated 100-row dataset. In 30.007 seconds at concurrency eight it read
26,583 matching responses, with zero transport/status errors or changed documents
(885.91 requests/s; P50 8.178 ms, P95 11.377 ms, P99 12.628 ms, maximum 16.066 ms).
The pre/post API documents matched and independent SQL confirmed all 29 returned
attempt references. The temporary viewer was revoked. This verifies the tool's
actual read path at this data size, not large-history capacity.

## Optimized native build

The release build from source `32f49dd` was compiled locally and started using the
existing database, encryption identity and private configuration. Process command
inspection confirmed the release executable was serving requests. Its SHA-256
was `fcaa9b6f6385859a3de579a0551e1e59aa1a9e0d3334ae6bcb4436debcdd612a`.
No image build or container acceptance was involved.

Using the committed read tool, the same 29-row `limit=100` page and eight persistent
connections completed 57,351 matching responses in 30.002 seconds (1,911.55/s),
with zero errors or changed documents. Latency was P50 3.538 ms, P95 4.723 ms,
P99 5.486 ms and maximum 24.209 ms. Independent PostgreSQL reads confirmed all
29 returned references. The temporary scoped viewer was revoked. This separates
optimized-build observations from the earlier debug baseline; client throughput,
small data size and short duration still preclude a production capacity claim.
A few payment-inventory and saved-video authorization checks ran concurrently,
so this is not a strictly isolated comparative experiment.

The release service also returned the documented payment inventory with the
same authorization denials and unchanged company balance. Saved video replay
retained one original submission and rejected changed input and unauthorized
scopes. After the read measurement, an actual personal streaming request
completed and its saved timing/usage record was retrieved. Temporary credentials
were revoked. These cover the exercised native release paths, not every payment
or video lifecycle or the full performance matrix.

## Release service at 32 concurrent readers

The release service including `0112d9e` was measured for 60.008 seconds with
32 persistent-connection workers and a scoped viewer. The now-current page held
38 actual saved requests (46,984 bytes), following additional real streaming
work. It completed 108,649 matching responses with zero errors and zero changed
documents: 1,810.57 requests/s, P50 11.924 ms, P95 26.862 ms, P99 36.673 ms and
maximum 72.039 ms. The pre/post API documents matched, and independent PostgreSQL
inspection confirmed all 38 references. The temporary viewer was revoked.

On the ten-logical-core host, 60 one-second gateway `ps` samples recorded peak
CPU 175.3% and RSS from 17,152 to 27,696 KiB. PostgreSQL and load-generator resource
usage are excluded. The Python client also parses and canonicalizes every full
response, so its own CPU/locking can constrain throughput. The page size differs
from the earlier eight-client run; these numbers are not a like-for-like scaling
ratio or evidence that the server saturated. Startup memory growth and one
minute of observation do not establish long-duration memory stability.

The measured local envelope is a small, warm, real-history page at up to 32
readers for one minute. Larger histories, cold caches, concurrent writes,
steady-state process memory and production-network measurements remain open.

## Request-detail measurement

The reusable tool now also accepts a saved request-detail URL without query
parameters, validates its returned attempt identity and hashes the full JSON
response on every read. List behavior remains available; output identifies the
endpoint kind. Tokens and response contents remain outside stdout.

On the optimized gateway with source through `1bb7007`, a newly issued scoped
viewer read the actual completed personal request described in the financial
verification report. Eight persistent-connection workers ran for 30.001 seconds:
382,592 matching 974-byte detail responses, zero errors and zero changed
responses, 12,752.73 reads/second, P50 0.570 ms, P95 0.998 ms, P99 1.266 ms and
maximum 10.305 ms. The API remained identical before/after; independent PostgreSQL
inspection confirmed the original 11 input tokens, 2 output tokens and completed
execution. The viewer was revoked.

A subsequent five-second list-mode check in the same one-request workspace
returned 10,565 matching responses with zero errors/mismatches. This checks the
updated tool against another actual endpoint, not a comparison with the earlier
larger-workspace list baselines. Both measurements include loopback client and
server work on the same machine, are closed-loop and do not establish production
capacity, a service-level target, inference throughput or large-dataset behavior.

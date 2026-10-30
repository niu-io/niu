# Media and upstream architecture review — 2026-10-30

This is a dated source and verification record for Beads `niu-32s.3`, under
architecture review `niu-32s`. Current execution state belongs in Beads.
The reviewed source was `282dd68` plus the working changes described below.

Subsequent user-authorized generation supplied a fresh real result. The
[follow-up acceptance record](architecture-media-live-2026-10-30.md) verifies
successful delivery, overload, HTTP/2 flow-controlled ownership and cancellation
using that single video. The expired-artifact limitation below describes the
initial run, before that follow-up.

## Scope

Inspected the shared upstream client pool, inference stream parsers and
cancellation ownership, media inspection workers, media result transports,
result delivery, and execution observation validation. Existing source bounds
include pinned DNS destinations, disabled automatic transport retries and
redirects, explicit public-result URL policy, bounded result bodies, bounded SSE
events, and decoder permits held inside blocking work. These are source findings,
not a claim of end-to-end qualification of every upstream protocol.

## Confirmed source issue and correction

`apps/gateway/src/web/inference/video_results.rs` previously allowed 32 downloads,
each bounded to 64 MiB, after reserving only one 64 KiB delivery unit per request.
The remaining delivery reservation was acquired after the complete upstream body
had already been buffered. The upstream phase could therefore retain up to 2 GiB
of result payloads outside the intended 256 MiB downstream buffer budget. This is
derived from admission order and configured limits; no production RSS estimate or
out-of-memory incident is asserted.

The revised path reserves the complete permitted result size before starting the
result GET. Download and delivery use the same 256 MiB reservation pool. After
reading a bounded body, it releases only capacity no longer required by the
actual `Vec` allocation. An overloaded request cannot start that result GET.
Fresh-result recovery still performs its separate authorized metadata query
before reaching result download admission.

`crates/media/src/result.rs` now caps requested geometric buffer growth at the
declared result limit. A 10 MiB limit can no longer request a 16 MiB buffer through
default `Vec` growth. Allocation failure returns a transport-domain error.

The new `video_results/memory.rs` keeps the bytes and their reservation under one
`Bytes::from_owner` owner. Each network frame slice retains that owner. Dropping
the body stream cannot release its reservation while a yielded frame still owns
the complete backing allocation.

The budget describes retained result-buffer capacity. It is not a limit on total
process RSS: HTTP buffers, allocator overhead and transient reallocation are
separate. Artifact capture retains its existing independent two-operation,
8 MiB-per-result ceiling.

## Actual current-route execution

An existing development database containing original OpenRouter video jobs was
copied into an isolated PostgreSQL database. The current rebuilt gateway used
that copy and the matching encryption configuration. The original database was
not changed. The tested executable's SHA-256 was
`23b3c68331f4e57d6db0be3747bb1bd0304260323933e0ef1149d55f65da32bf`.
The copy's currency and noncash funding prerequisites were completed
through ordinary administrative APIs, and a short-lived workspace API key was
issued through the normal API. No authorization, retention or Provider binding
checks were bypassed.

After the run, the verification key was revoked through the API (HTTP 204) and
the owned gateway process exited. Private artifacts were preserved outside the
public repository.

Five original tasks were read through the authenticated video API, each returning
HTTP 200. Each then received an explicit
`POST /v1/video/jobs/{id}/results/video/refresh` request. No generation request was
submitted.

All five fresh-result requests returned HTTP 502 with the customer-safe
`media_result_gone` error. Independent inspection of the saved transport records
found five received metadata queries and five result-download failures with
Provider HTTP 410. The media-job count remained five. The cached references were
not made readable again.

Each returned error artifact was 154 bytes of JSON, with SHA-256
`840ffa4030be0b74c9b9d1b36097286512acd201e30d263f673b11fc7ec009ed`.
These are error artifacts, not delivered video files. The current run establishes
the authenticated recovery failure path and its durable Provider-status record;
it does not establish successful result delivery or the memory ceiling under
concurrent large downloads.

## Initial verification limits

A temporary helper probe was executed with
`cargo run -p niu-media --example architecture-result-memory -- <input> <artifacts>`.
Its outcome is disregarded and supplies no correctness, regression, priority,
integrated-behavior or acceptance evidence. The temporary example was removed
from the public working tree.

The available genuine Provider artifacts have been retired upstream (HTTP 410),
so this run produced no valid final media artifact for independent inspection.
Successful download, concurrent saturation, cancellation during large delivery,
and post-delivery reservation recovery remain unverified through the complete
gateway route. Beads `niu-32s.3` remains open with `needs-verification`; source
implementation and a compiled binary do not close that acceptance gap. The next
required input is a currently retrievable genuine saved video result, used through
the normal current gateway API without creating a paid generation.

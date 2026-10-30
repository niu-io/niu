# Architecture review and repairs — 2026-10-30

The review started from `282dd68e29e5bdfc23823f404e5dba9d929441b1`.
Implementation and observations below belong to the local working tree; they
are not evidence of a production deployment. Beads epic `niu-32s` owns current
execution state. This dated record documents findings and evidence, not a second
backlog. Existing UX and marketing work was preserved.

## Review boundaries

The review covered Gateway startup and shutdown, schema compatibility, HTTP
body handling, operator/session authorization, password management, transactional
money and policy enforcement, upstream client construction, stream lifetimes,
media retrieval buffers, static routing, readiness and distribution configuration.
It combined source review with isolated native Gateway and PostgreSQL 17 runs.
The initial review performed no paid inference, production mutation or
deployment. A later user-authorized follow-up generated one inexpensive real
video to finish the media acceptance described below; production remained
unchanged.

Fixture outcomes have zero evidentiary value. Build/lint checks establish static
hygiene only. Integrated claims below require actual current-input execution and
independent inspection of the resulting database or output artifacts. Historical
review closures were not treated as proof about this revision.

## Confirmed findings and corrections

### Platform identities could be managed by a customer Owner (`niu-32s.2`, P1)

Ordinary management checked company/workspace scope but did not distinguish a
target with platform authority. An Owner in the same company could issue a
session for that target or reset its password; the resulting identity had
platform privileges. Session/identity revocation and management reads shared
the missing distinction.

The Gateway now checks the target's platform status and the actor's current
authority. Storage mutation transactions lock and recheck the target, preventing
a concurrent platform grant from invalidating the earlier authorization check.
Ordinary scope and role checks remain required.

Actual native requests exercised both administration aliases, ordinary and
platform administration, browser authentication and four concurrent grant
interleavings. Independent PostgreSQL reads checked sessions, credentials and
revocation state. See [security evidence](architecture-security-2026-10-30.md).

### Legacy schema conversion raced concurrent startup (`niu-32s.1`, P1)

Legacy-schema detection happened before SQLx migration locking; receipt
conversion happened after releasing that lock. Concurrent startup could act on
stale receipt state. A controlled PostgreSQL interleaving reproduced a duplicate
primary-key failure in `_sqlx_migrations`.

One dedicated connection now holds the same SQLx migration advisory lock across
detection, legacy upgrades, receipt conversion and current migrations. Release
integration also retains remote main's compatibility lock, acquired before the
SQLx lock on that same connection, plus its baseline validation and lock-retry
behavior. Nested migrators use the connection without independently releasing
the locks. The connection closes on drop rather than returning a potentially
locked session to the pool. See
[migration evidence](architecture-storage-2026-10-30.md), including the final
v0.2.29 executable's migration-391 and concurrent-lock observations, and the
distinction between returning a connection and PostgreSQL finishing an
already-running statement after client cancellation. Hosted deployment runs
migrations during Gateway startup and already has migration 391; no separate
migration job or production legacy conversion is assumed.

### Video download allocation preceded memory admission (`niu-32s.3`, P1)

The previous download path admitted up to 32 downloads with only one 64 KiB
memory permit each, then acquired the remaining permits after buffering up to
64 MiB per result. Source bounds therefore allowed approximately 2 GiB of
download buffers in addition to already admitted delivery buffers. This is a
source-derived upper bound, not measured process RSS.

The implementation reserves the full possible result size before network work,
caps buffer growth, and reduces the reservation only to the allocated capacity.
The reservation must survive every byte slice through final delivery, including
slow consumers and cancellation. The shared retained-buffer budget is 256 MiB;
it is not a whole-process memory ceiling. See the [media evidence and remaining
qualification limits](architecture-media-2026-10-30.md).

The current native Gateway read five genuine historical tasks from an isolated
database copy. Normal fresh-result retrieval reached the Provider, but all five
files returned HTTP 410. The Gateway returned `media_result_gone`; independent
transport records confirmed those failures and an unchanged job count. No new
generation was submitted. The successful delivery and saturation branches remain
unverified in that initial run because a valid current result was unavailable.
Fixture results did not replace the missing evidence.

The user then authorized one inexpensive new video. The
[real-video follow-up](architecture-media-live-2026-10-30.md) independently
verified the MP4 and exact download bytes. Eight simultaneous GETs admitted four
downloads and refused four locally; an HTTP/2 one-byte flow-control window kept
a result buffer owned, reducing subsequent admission to three. Cancelling that
stream restored admission to four. Persisted transport counts matched the
admitted downloads. This completed the remaining finite media acceptance scope
without creating another generation for load or cancellation.

### Partial request bodies had no receive deadline (`niu-32s.4`, P1)

Byte limits did not bound time. Payload capture and JSON extraction could wait
before handler-specific deadlines or authentication while a client left the
body unfinished. The new outer body middleware applies an absolute upload
deadline without prebuffering or changing response streaming. HTTP body frames,
including trailers, retain their normal form. Chunk arrival does not renew the
deadline.

`server.request_body_timeout_seconds` defaults to 30 seconds and accepts 1–3600.
An operator with slower legitimate uploads can explicitly raise it. Expiry
returns HTTP 408 and the safe `request_timeout` code. This is independent of
Provider timeouts and is not a global request-processing deadline.

An isolated native run used a one-second setting and a newly initialized
database. The pre-correction native binary left each of three uploads pending
for the observation window of 3.268–3.283 seconds: partial Content-Length,
chunked trickle, and an administration JSON body. This finite observation plus
source inspection establishes the missing deadline; it does not claim a timed
measurement of an infinite wait.

With the correction, the same current-input socket operations returned 408 in
1.003–1.005 seconds in the final run. Responses preserved `no-store`, request correlation and
safe JSON errors. Malformed JSON remained 400, a missing credential remained
401, a body exceeding 1 MiB remained 413, and an authenticated management read
returned 200. Independent PostgreSQL inspection after process exit found no
attempt records. Startup rejected 0, 3601 and a noninteger value for the new
setting. A separate final-binary security run exercised successful authenticated
member creation, login and password changes.

The before binary SHA-256 was
`bf655df4d352a60038b15de6df829f2e432e28c831ce93d9097cb639d733b646`;
the final body/security binary SHA-256 was
`23b3c68331f4e57d6db0be3747bb1bd0304260323933e0ef1149d55f65da32bf`.
The earlier binary already contained the concurrent migration and platform
identity fixes. Private raw execution records are retained outside the public
tree. One initial body probe hit an occupied port; its observations were
discarded, and the reported run verified its own process had started listening.
An independent source review caught Tokio's ready-future polling precedence;
the final middleware checks the absolute deadline before polling each frame.

## Additional review observations and limits

Static hygiene completed: native Gateway build with `mock-payments`, Clippy with
warnings denied for all targets of `niu-gateway`, `niu-storage` and `niu-media`,
workspace formatting, imported-source integrity, generated handler contracts,
OpenAPI entrypoints and whitespace checks. Test targets were compiled by Clippy;
fixture tests were not executed as acceptance evidence. Existing formatting drift
in storage exports/route pools and a complex route-pool tuple were cleaned up
with formatting and a type alias; that cleanup changes no runtime behavior.

- Current upstream construction pins resolved public addresses, disables
  redirects/proxies/implicit retries, and applies connection/DNS/request bounds.
  These are inspected mechanisms, not proof against every SSRF or transport
  failure interleaving.
- Durable accounting separates customer charges and Provider liability, uses
  integer amounts, and retains uncertain execution. No additional corruption
  was confirmed in this source review. No new priced-inference, full financial
  concurrency or production load acceptance is claimed.
- Static routing separates marketing artifacts from product/API paths;
  readiness checks schema, routing and encrypted configuration in addition to
  database reachability. This review did not repeat the complete browser journey.
- The upload correction does not bound partial HTTP headers, total concurrent
  connections, every administration SQL query, diagnostics backlog, or the
  complete shutdown sequence. Existing bounded phases must not be presented as
  a universal availability or memory guarantee.
- `production-design.md` incorrectly said the Gateway and durable accounting
  were not implemented. Its status now distinguishes implemented mechanisms
  from requirements that still need separate qualification.

All four confirmed repairs now have scoped current-input acceptance evidence.
This review is not an all-green product release assessment. The exercised media
Provider journey and compilation do not establish production-scale load,
multi-instance failover, every Provider/model combination or a restored
production backup.

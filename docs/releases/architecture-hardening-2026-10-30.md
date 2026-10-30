# Architecture hardening release — 2026-10-30

This dated record follows Beads `niu-i83` and the completed review `niu-32s`.
It records the v0.2.29 patch qualification, not a rerun of every product journey
in the historical v0.2.26 release checklist. Fixture outcomes have zero
acceptance value. Build, lint and source-boundary checks are static hygiene.

## Candidate and integration

The candidate integrates remote core `47cffaa5c01e227494436d25be3eda4ae025538c`
with the four [architecture repairs](../reviews/architecture-review-2026-10-30.md).
It preserves every migration already deployed in v0.2.28, including migration 391.
No SQL migration is added or changed by this patch. The native v0.2.29 binary
used for current-input verification has SHA-256
`8d90ab8fe9338a7d394d1f5683133e56d28f053bd8c8f8642373a1df7213ddf3`.

The hosted rollout retains the current marketing revision
`043bb71ec38ede6d83f2a758b8444adfcebc5131`, plugin pins, service capacity and
runtime configuration. Existing v0.2.28 dashboard assets must remain available
for browsers opened before deployment. Unaccepted local landing experiments
are outside this release.

## Current-input native evidence

- **Authorization:** actual native HTTP requests exercised both administration
  aliases, customer Owners, platform identities, ordinary identity operations,
  browser login and password changes. Independent PostgreSQL queries verified
  no protected mutations on rejected requests and correct persistence on allowed
  operations. Four concurrent platform-grant interleavings denied the raced
  mutation after locking. Historical revoked/missing ordinary targets preserve
  their conflict responses.
- **Uploads:** unfinished Content-Length, trickled chunked input and administrator
  JSON input returned HTTP 408 in 1.003–1.004 seconds with a 1-second configured
  budget, `request_timeout`, `no-store` and request IDs. Complete malformed,
  unauthenticated and oversized requests retained 400/401/413; an authenticated
  read returned 200. An independent database query found zero inference attempts.
- **Migration integration:** a real isolated PostgreSQL 17 database upgraded 390
  to 391 without changing the prior eight receipts. All nine final receipts
  matched source SHA-384 values. Two current migration processes waited behind
  the compatibility lock and completed after release. A separate SQLx lock
  blocker demonstrated compatibility-before-SQLx ordering on the same session;
  the second process waited for compatibility. Final receipts were unchanged,
  no advisory locks remained, and the actual schema-check command succeeded.
  See [migration evidence](../reviews/architecture-storage-2026-10-30.md).

- **Media:** the same genuine previously generated video remained available.
  The final binary returned the identical 213,782-byte MP4 with SHA-256
  `277e5f4b0047843e1d6814258bc9e3e2277b23ff141d5ba24e18bdb79e211fcf`;
  independent decoding verified 848×480 H.264 and 25 frames. Eight simultaneous
  downloads admitted four and refused four locally. Holding an HTTP/2 stream
  at a one-byte window reduced admission to three; cancelling that stream while
  keeping its connection open restored admission to four. Persisted Provider
  transport receipt increments matched each admitted batch. No new video was
  generated for this release verification.

The default upload budget remains 30 seconds, independent of response-stream
lifetime. Native concurrency checks do not establish whole-process memory
limits, broad load capacity or production stress tolerance. PostgreSQL may finish
an already-running statement after a cancelled client disconnects.

## Build and publication checks

The candidate completed native Gateway compilation, Clippy for the changed
crates and their targets, workspace formatting, imported-source integrity,
generated OpenAPI consistency, release-version consistency and the public source
boundary scan. These establish build/source hygiene only; the actual requests,
PostgreSQL observations and decoded media above establish the described runtime
behavior.

The immutable [v0.2.29 release](https://github.com/niu-io/niu/releases/tag/v0.2.29)
was published at 2026-10-30T10:53:30Z from core
`89212a6c01b8a1d6c7c89100f3f17f276d5f855b`. Its downloaded `SOURCE_COMMIT`
agreed, and every downloaded release asset matched `SHA256SUMS`. The source
commit and Beads database were pushed. The observed hosted rollout follows.

## Observed production deployment

The existing deployment workflow completed, and Render deployment
`dep-dbi7ej0ae00c73begp30` became LIVE at 2026-10-30T11:09:13Z. The immutable
composition is `40220fec13fe5ddbc610b6004700b0ed637baceb`, with core
`89212a6c01b8a1d6c7c89100f3f17f276d5f855b`. The new instance startup log
independently reports version `0.2.29`; this is runtime version evidence, not a
claim that the remote executable was downloaded and hashed.

Actual hosted checks after the switch verified:

- Database/schema readiness and liveness returned 200. Public authentication
  configuration, model catalog and OpenAPI were reachable.
- A fresh password login returned 200, the same-origin session returned 200,
  cross-origin cookie use returned 403, and saved workspaces remained readable.
  Revoking this verification session returned 204; its next session read returned 401.
- A browser opened before deployment navigated to workspace settings without
  reloading. Reload preserved its authenticated session and saved workspace name.
  Desktop and 390px rendered layouts were inspected; the narrow document width
  was 390px with no horizontal overflow. The verification session was then logged
  out and the temporary browser space closed.
- Existing dashboard JavaScript and CSS retained their previous exact bytes.
  All 13 inspected new and retained asset URLs returned 200 with the correct MIME
  types. The marketing source pin stayed
  unchanged. Its HTML differed only in two generated Astro island identifiers;
  reconstructing those identifiers from the previous build metadata reproduced
  the independently recorded previous whole-HTML digest exactly.

The new instance had no error-level log entries from startup through
2026-10-30T11:10:35Z; this is a bounded observation, not an uptime guarantee.

The release introduces no new SQL migrations and no new video generation. The
isolated verification Gateways and PostgreSQL were stopped; short-lived API keys
and browser verification sessions were revoked.

## Verification limits

Three bounded incomplete unauthenticated uploads through the public ingress did
not expose an application 408 response: an idle connection reset after 15.552
seconds, while a request sending one whitespace byte every 2 seconds had no HTTP
response during 40 seconds of observation and was then closed by the client. A chunked
request with the same trickle pattern likewise produced no HTTP response during
35.215 seconds and was closed by the client.
The final native binary's absolute upload deadline is verified above; the same
response through the hosted ingress remains **unverified**. Missing application
logs do not prove buffering or identify which intermediary handled the request.
These probes had no credentials and never completed a JSON request body.

The security grant-race and media saturation/cancellation checks used isolated
real PostgreSQL/native Gateway runs, not production stress. This patch record
does not declare every historical product acceptance case GREEN for v0.2.29.

## Packaged artifact verification

The immutable tag's [package job](https://github.com/niu-io/niu/actions/runs/41044026604/job/124027575248)
completed the released-migration immutability check, previous/current Linux
container builds, runtime package contents inspection and final public-asset
boundary scan. The last artifact scan completed at 2026-10-30T11:22:08Z, for
source `89212a6c01b8a1d6c7c89100f3f17f276d5f855b` / `v0.2.29`.

The required workflow also executed `python3 scripts/package-smoke.py`,
`python3 scripts/package-smoke.py --compose`, and
`python3 scripts/package-upgrade-smoke.py`. Their fixture outcomes are disregarded;
they do not establish runtime, upgrade or release acceptance. The real-request,
PostgreSQL and media evidence and its limits are recorded above.

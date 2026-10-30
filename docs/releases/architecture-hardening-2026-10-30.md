# Architecture hardening release — 2026-10-30

This dated record follows Beads `niu-i83` and the completed review `niu-32s`.
It records the v0.2.29 patch qualification, not a rerun of every product journey
in the historical v0.2.26 release checklist. Fixture outcomes have zero
acceptance value. Build, lint and source-boundary checks are static hygiene.

## Candidate and integration

The candidate integrates remote core `47cffaa5c01e227494436d25be3eda4ae025538c`
with the four [architecture repairs](../reviews/architecture-review-2026-10-30.md).
It preserves every migration already deployed in v0.2.28, including migration391.
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
  JSON input returned HTTP408 in1.003–1.004 seconds with a1-second configured
  budget, `request_timeout`, `no-store` and request IDs. Complete malformed,
  unauthenticated and oversized requests retained400/401/413; an authenticated
  read returned200. An independent database query found zero inference attempts.
- **Migration integration:** a real isolated PostgreSQL17 database upgraded390
  to391 without changing the prior eight receipts. All nine final receipts
  matched source SHA-384 values. Two current migration processes waited behind
  the compatibility lock and completed after release. A separate SQLx lock
  blocker demonstrated compatibility-before-SQLx ordering on the same session;
  the second process waited for compatibility. Final receipts were unchanged,
  no advisory locks remained, and the actual schema-check command succeeded.
  See [migration evidence](../reviews/architecture-storage-2026-10-30.md).

- **Media:** the same genuine previously generated video remained available.
  The final binary returned the identical213,782-byte MP4 with SHA-256
  `277e5f4b0047843e1d6814258bc9e3e2277b23ff141d5ba24e18bdb79e211fcf`;
  independent decoding verified848×480 H.264 and25 frames. Eight simultaneous
  downloads admitted four and refused four locally. Holding an HTTP/2 stream
  at a one-byte window reduced admission to three; cancelling that stream while
  keeping its connection open restored admission to four. Persisted Provider
  transport receipt increments matched each admitted batch. No new video was
  generated for this release verification.

The default upload budget remains30 seconds, independent of response-stream
lifetime. Native concurrency checks do not establish whole-process memory
limits, broad load capacity or production stress tolerance. PostgreSQL may finish
an already-running statement after a cancelled client disconnects.

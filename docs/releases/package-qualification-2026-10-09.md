# Package qualification — 2026-10-09

## Current source checkpoint

A fresh frozen Linux/arm64 image includes ingestion history, strict command
validation, availability and outcome diagnostics. Its
[pinned record](evidence/package-2026-10-09-0201-history.json) identifies the
source snapshot and qualification harness separately. Build and the full
1,397-file public/build-input check passed. Full direct-container and Compose
fixture sets passed, including encrypted asset recovery, branding, source
preparation/delivery/deletion and PostgreSQL restart/backup/restore. Packaged
history and diagnostics survived restoration; foreign keys/cursors were denied,
and command overrides failed before ingestion claim creation. The pinned
0188-to-current upgrade also passed migration-failure recovery and original
workspace/video/charge/liability/asset preservation without replay.

These are controlled subsets. Upstream ingestion/readiness polling, public HTTPS
source fetching, live inspection/Supplier qualification and complete customer
journeys remain open. Pagination ties and erasure-based availability have native
evidence, not equivalent positive packaged fixtures. No F01–F10 completion is
claimed.

## Earlier 0201 source checkpoint

The earlier frozen Linux/arm64 source through migration 0201 passed build,
direct-container smoke, Compose lifecycle and an 0188 → 0201 upgrade. The
[machine-readable record](evidence/package-2026-10-09-0201.json) pins the image,
source snapshot and harness hashes. Previously qualified Node, Rust and Debian
base digests are now pinned in the Dockerfile. A build defect was fixed by copying
shared branding tokens into the Rust stage before compilation.

Direct acceptance covered controlled text/video inference, customer settlement,
encrypted asset listing/lookup/update recovery and branding. Compose covered
application/PostgreSQL restarts, backup/restore, graceful drain and migrations.
Its qualification inputs matched the frozen snapshot; the harness ran from a
Docker-shared config location. Upgrade acceptance preserved migration receipts,
workspace records, video state, pinned charges, uncertain liability, asset
credentials and prepared requests. Injected DDL failure prevented readiness;
recovery applied pending migrations without replay or duplicate settlement.

This supersedes the 0188 package checkpoint below. Native image-source,
ingestion and readiness APIs still need their complete packaged flow acceptance.
Live Supplier entitlement, discounted supply and complete rendered customer
journeys remain open. No full F01–F10 completion is claimed.

## Packaged image admission checkpoint

A subsequent [image-admission record](evidence/package-image-admission-2026-10-09.json)
pins the updated harness and the same 0201 image. Direct-container and Compose
runs passed the negative image API checks before and after application restart:
absent authentication and installation tokens cannot access customer operations;
caller verdicts and preparation without inspection consent are rejected; invalid
source/group/permission bindings cannot establish consent; missing saved
observations return 404 and missing-source erasure remains opaque. The checks
verify unchanged source, ingestion, readiness, attempt and customer-accounting
row counts. Both existing lifecycle smoke runs also passed.

This is an additional negative packaged subset. It does not qualify positive
source-to-ingestion/readiness, public HTTPS retrieval or later native validation,
availability and diagnostic changes. Complete packaged and live acceptance
remains open.

## Positive inspected-source package checkpoint

The pinned 0201 image passed a direct-container inspected-source lifecycle using
a controlled loopback detector and explicitly activated workspace processing
consent. A PNG was prepared through the public API; another key's opaque erasure
left its content intact; retention survived application restart; original-key
erasure removed content and repeated erasure preserved one tombstone. Negative
image admission and existing direct lifecycle smoke passed in the same run. The
[source checkpoint record](evidence/package-image-source-2026-10-09.json) pins
the image and updated harness hashes.

This qualifies a controlled packaged preparation/retention/erasure subset only.
A subsequent [Compose source record](evidence/package-image-source-compose-2026-10-09.json)
qualifies the same positive subset under Compose with an isolated configuration
override. The inspector is restarted after application restart so it joins the
current loopback namespace. Foreign-key isolation, source retention and repeated
erasure passed; existing Compose lifecycle checks also passed in that run.
The later [source recovery record](evidence/package-image-source-recovery-2026-10-09.json)
adds direct-container and Compose PostgreSQL restart and backup/restore coverage.
The prepared source exists during recovery: all restored public table/sequence
fingerprints match, its ciphertext hash is preserved, foreign-key erasure remains
ineffective after the restored database is promoted, and original-key erasure
still succeeds. Each repeated backup retains its previous synthetic database
under a unique name until isolated-container cleanup.

The [restored-source delivery record](evidence/package-image-source-delivery-2026-10-09.json)
adds direct-container and Compose decryption/delivery checks: after backup
restoration, the public source endpoint returned the byte-identical original PNG
with its image content type; erasure then caused HTTP 404. Source preparation,
consent and deletion use real APIs. Original group identity, operation grant,
ingestion claim and capability are explicitly synthetic rows seeded after
restore in the disposable database. This does not qualify group creation,
claim/capability issuance or preservation of those synthetic rows across restore.

The subsequent [ingestion-history record](evidence/package-ingestion-history-2026-10-09.json)
moves the synthetic group/grants, ingestion claim, original access capability and
accepted/Active observations before backup. Direct-container and Compose runs
preserved all records through PostgreSQL restart and promoted restoration. Exact
source delivery worked within its original capability lifetime on both sides of
recovery. The saved readiness response stayed identical with reuse unavailable;
another key received 404. This qualifies historical persistence and authorization,
not runtime issuance, upstream submission or status polling.

Ingestion dispatch/readiness polling, public HTTPS fetching, live detector
effectiveness and full customer journeys remain open.

## Previous 0188 checkpoint

The frozen Linux/arm64 source through migration 0188 passed direct-container and
Compose smoke, including restart, backup/restore and encrypted listing/lookup
and metadata-update recovery. Direct smoke additionally exercises controlled
text/video inference and customer settlement. Compose does not generate video.
The [machine-readable record](evidence/package-2026-10-09-0188.json) identifies
the image, source snapshot and harness hashes.

The pinned 0187 → 0188 upgrade passed. Injected DDL failure left the old migration
receipts unchanged and prevented readiness; recovery applied pending migrations
once. Workspace records, video state, pinned customer charges, uncertain
liability, asset credentials and prepared requests survived without replay or
duplicate settlement.

[Original-0174 compatibility](migration-0174-compatibility.md) separately passed
native database tests and preserved-data development startup. That older receipt
history has not yet had its own container upgrade fixture. Existing 0187 receipt
history is covered by the pinned package upgrade above. No receipt rewrite,
database reset or checksum-validation disablement was used.

Synthetic grants and responses establish no live Supplier rights or channel
qualification. Unpinned Git identity still rejects Enterprise manifests. Full
F01–F10 acceptance, live transport and complete browser journeys remain open.


## Current-source build attempt through 0193

The [0193 attempt record](evidence/package-2026-10-09-0193-attempt.json) identifies
the fresh source snapshot and successful public/build-input boundary check. Docker
Hub base-image metadata retrieval failed before compilation because its TLS
certificate did not cover the requested registry hostname. Verification was not
bypassed and no new image was produced. At that checkpoint, 0188 remained the
latest packaged evidence; branding, deletion consent/dispatch and media-ingestion
qualification require a newer successful build and their own packaged checks.


## Current-source build attempt through 0196

The [0196 attempt record](evidence/package-2026-10-09-0196-attempt.json) identifies
a new frozen snapshot containing required-detector source proofs, expiration
cleanup and admission capacity limits. Its public/build-input boundary check
passed. Docker Hub base-image metadata retrieval failed before compilation with
a TLS handshake timeout. No image was produced and TLS verification remained
enabled. At that checkpoint, 0188 remained the latest qualified package; none of those native
0193–0196 checks established packaged acceptance. The newer 0201 checkpoint above supersedes that build blocker. Complete new
asset-source retention/ingestion/readiness package acceptance remains open.


A subsequent registry availability recheck also failed before image retrieval:
Docker Hub returned a certificate for an unrelated hostname. No TLS bypass or
package acceptance claim was made. Native source-delivery checks remain separate
from the latest qualified 0188 package.

# Packaged individual lookup recovery

Status: controlled direct-container and Compose acceptance passed through migration 0187.
Updated 2026-10-08. The full release and live Supplier qualification remain open.
[Machine-readable evidence](evidence/package-2026-10-08-0187.json) records the
image, frozen source snapshot and harness hashes.

## Qualified package run

A fresh Linux/arm64 public-source image passed both package smoke paths with
`NIU_PACKAGE_ASSETS=1`, `NIU_PACKAGE_LISTINGS=1`, `NIU_PACKAGE_LOOKUPS=1` and
`NIU_PACKAGE_UPDATES=1`. Initial state, restart and backup/restore checks passed.
The metadata fixture reconciles an acknowledged update from a read retained
before restart, then preserves its released hold and immutable reconciliation
after restore. A separate uncertain update remains held and cannot replay.
The pinned 0178 → 0187 upgrade also passed: injected migration failure
remained fail-closed with unchanged old receipts, recovery applied all pending
migrations once, and saved workspace, video and prepared asset data survived.
Video settlement remained tied to its original prices without replay.

The disposable fixture retains a successful original group and encrypted listing,
a separate GetAsset grant, a successful lookup with an encrypted single-item
snapshot, and an unresolved lookup. All grants and outcomes are synthetic; no
Supplier request is sent and they establish no live entitlement. Fixture secrets
reach Node crypto through stdin, never process arguments or environment.

The existing initial, restart and backup/restore listing assertions now also
compare lookup claim/grant/source-digest/outcome/timing/content-hash/expiry
snapshots, recover the encrypted result through the packaged lookup endpoint,
and verify safe history with unknown fields retained as null for unresolved work.
The lookup encryption domain is distinct from listing encryption.

## Harness evidence

Eight listing/lookup harness tests passed. They check rejection of changed
snapshots before HTTP, incorrect recovered content, fabricated unresolved
measurements, unsafe identities before SQL, and authenticated encryption with
separate listing/lookup domains. All 66 package harness tests passed. Python
compilation, whitespace and the four-file public-boundary check passed.

These tests qualify verifier behavior only. They do not prove SQL fixture
execution in an image, packaged lookup decryption, process restart, backup/restore
or migration upgrade. Metadata-update packaged recovery also remains open.
No F01–F10 gate is completed by this harness increment.

## Current image attempt

A frozen current-source export contained 1,333 files, including one reviewed
internal symlink, with snapshot SHA-256
`556775e6de5f0dd02718546a8128a1a5816fd50e079b33ed0ef8bdf63c5b1285`.
The full public-boundary scan passed over its 1,332 regular files.

Two Linux/arm64 image-build attempts stopped while resolving Docker Hub base
metadata: the first failed on `node:24-bookworm-slim`, the retry on
`debian:bookworm-slim`, both with registry HEAD request EOF. Neither produced
a qualified current image. The harness has therefore not run through packaged
restart/restore for lookup data. This is a build dependency failure, not evidence
of an application failure or a passed release gate. The 0178 checkpoint remains
the latest qualified package. Other local release work can continue.

## Native SQL, restart and restore acceptance

A freshly built native gateway passed the isolated runner
`scripts/native-asset-recovery-smoke.py` through migration 0187. Initial fixture
SQL and encrypted listing/lookup retrieval passed. Stopping and starting the
process preserved exact saved snapshots and unresolved audit. Dumping to SQL,
restoring into a new database and starting a new process preserved encrypted
lookup retrieval, audit, grant/source binding, timing, ciphertext hashes and
expiry. The runner uses only temporary resources and generated credentials;
cleanup stops its own gateway and PostgreSQL cluster. No existing development
service/data or Supplier endpoint is used.

The first run correctly exposed an incorrect verifier envelope: lookup results
contain `data.lookup_id` and `data.asset`, not flat asset fields. The harness was
corrected and the full native run passed. All 66 package harness tests passed
again after the correction. Python compilation, whitespace and the four-file
public-boundary check passed. This correction postdates the failed frozen image
attempt; the next image build needs a fresh source export.

This proves native fixture SQL execution, authenticated lookup recovery and
process/database recovery. It does not qualify the container image, Compose,
metadata-update recovery or a live Supplier channel.

## Native metadata-update recovery

The native runner also passed metadata-patch preparation, process restart,
authenticated patch restoration into a durable claim, credential failure before
transport, uncertain hold preservation, another restart, SQL backup/restore and
replay denial. Its separate credential revision contains an invalid format byte,
which deterministically prevents signer/transport construction. Existing valid
listing/lookup credentials are preserved. The successful uncertain response
after restart proves patch authentication/digest/request restoration occurred
before the deliberately rejected management credential. No upstream mutation
is sent and no customer balance entry, reservation or charge is created.

`scripts/package_asset_updates.py` supplies the same controlled fixture to the
optional package path. Enable `NIU_PACKAGE_UPDATES=1` with
`NIU_PACKAGE_LISTINGS=1` and `NIU_PACKAGE_ASSETS=1`; lookup recovery additionally
uses `NIU_PACKAGE_LOOKUPS=1`. Update dispatch occurs only after the package
restart, with audit/hold/ciphertext snapshots rechecked after restore.
All 71 package harness tests passed, including verifier rejection of changed
snapshots, incorrect hold/reason/retention, unsafe identities and replay
responses other than conflict. Native acceptance passed again with zero
customer financial records asserted. Python compilation, whitespace and the
six-file public-boundary check passed.

Container and Compose acceptance remain unproven. This fixture does not prove
acknowledged-write reconciliation across process recovery, successful live
mutation, live entitlement or complete asset CRUD.

The native recovery runner now also covers an acknowledged metadata update
with a successful encrypted read saved before process interruption. A fresh
process reconciles using that retained read without dispatch; a restored
database and another process retain the immutable reconciliation and released
hold with exactly one bound read. The current run passed with a freshly built
gateway and zero customer financial records. See
[metadata-update evidence](asset-group-update-verification.md) for the exact
synthetic-fixture boundaries. Container and live qualification remain open.

# Package qualification — 2026-10-08

The original Linux/arm64 checkpoint below passed through migration 0178.
A fresh build through migration 0187 now also passes direct and Compose smoke,
including encrypted asset listing/lookup and metadata-update restart/restore
([0187 evidence](package-lookup-recovery-verification.md)). The pinned 0178 → 0187 upgrade also passed injected migration failure
recovery, immutable receipt preservation and saved workspace/video/asset checks.
The full first release remains incomplete. [Machine-readable evidence](evidence/package-2026-10-08-0178.json)
records the image, frozen source and verification harness hashes.

0178 checkpoint image: `sha256:5148a63ba32c172ab8d1ce373821de28db5d54b26cfd8f725387ad87c7dca27a`

Previous image: `sha256:7bea921e0e602e5724874b80e279072655dd8d292e2639c9e3d45a9f9d219e71`

| Check | Verified scope |
| --- | --- |
| Independent build | Frozen public source; dashboard, docs, catalog and release gateway; no private source dependency. |
| Direct package | Streamed text, synthetic video recovery and customer charges, restart, backup/restore, migration receipts and graceful drain. |
| Compose package | App/PostgreSQL restart, backup/restore, member administration and prepared asset preservation. This branch does not generate video. |
| Distinct-image upgrade | 0174 → 0178, injected migration failure and recovery, immutable old receipts, saved workspace/key access, original video recovery and historical charges. |
| Prepared assets | Original encrypted management credential, actual request digest, fingerprint and account/project/workspace bindings survive restart, restore and upgrade. Unqualified creation remains denied without consuming the request. |
| Listing recovery | Direct and Compose recover AES-GCM encrypted root/child pages after app restart and backup promotion. Ciphertext digests, parent snapshot digest, page linkage, completion timings and an unresolved claim remain unchanged; descriptive GET and safe audit history agree. |
| Public boundary | 1,313 frozen files scanned plus one reviewed favicon symlink; 221 shipped dashboard/docs/catalog/license files scanned. The served favicon matches Niu's brand asset. |
| Harness | All 62 package harness tests passed. The complete frozen source and symlinks matched the worktree before writing this evidence. |

The listing fixture uses a separate disposable Supplier and synthetic original
group, review records and outcomes. Its encrypted bytes match the production
listing domain and workspace/identity binding; the packaged API decrypts and
validates both pages. No Ark request is sent and no live rights are qualified.
The original prepared-request fixture retains its separate unqualified account.
The 0174 image has no listing tables, so this upgrade cannot prove preservation
of preexisting listing results. Existing encrypted group-read results were not
seeded and remain recovery-unqualified.

An initial source export omitted the favicon symlink and was rejected. Fixture
setup collisions and a missing retention expiry were corrected before the final
passing runs. Interrupted runs are not acceptance evidence. The final image and
source hashes above identify the corrected build.

Reproduce with available pinned images on a configured Docker engine. Listing
fixtures additionally require Node.js on the test host for its standard crypto
module; the Niu runtime image has no Node dependency.

```sh
NIU_PACKAGE_ASSETS=1 NIU_PACKAGE_LISTINGS=1 NIU_IMAGE=<current-digest> python3 scripts/package-smoke.py
NIU_PACKAGE_ASSETS=1 NIU_PACKAGE_LISTINGS=1 NIU_IMAGE=<current-digest> python3 scripts/package-smoke.py --compose
NIU_UPGRADE_VIDEO=1 NIU_UPGRADE_ASSETS=1 NIU_PREVIOUS_IMAGE=<previous-digest> NIU_IMAGE=<current-digest> python3 scripts/package-upgrade-smoke.py
```

Live Supplier entitlement, discounted supply, complete asset and result workflows,
actual payments, full responsive browser acceptance and other architectures remain
unqualified. The unversioned build cannot qualify signed Enterprise manifests.
These checks do not pass full F01–F10 or V08–V10 gates.

The [0174 checkpoint](evidence/package-2026-10-08-0174.json) and
[0171 checkpoint](evidence/package-2026-10-08-0171.json) remain historical evidence.

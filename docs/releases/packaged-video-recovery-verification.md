# Video recovery acceptance

Reviewed 2026-10-07. Native acceptance passed against an isolated gateway,
PostgreSQL and controlled local upstream. A direct container subset also passed;
complete container deployment and live Supplier
qualification remain open; F01/F10, V17/V20 and M06–M08 are not fully qualified.

## Direct container checkpoint

The direct package smoke passed on 2026-10-07 against immutable image
`sha256:6178588bbba45ecc5f3cdf0c00f84159bd29c2c3a8be8495fcb4812d076c0f5d`.
The isolated PostgreSQL schema matched current source migration versions and
SHA-384 checksums. The real packaged gateway used a controlled local upstream.

The executed video branch covered known-job submission and terminal recovery,
customer tariff replacement during generation, saved historical customer
charges and scoped Logs, application restart and PostgreSQL dump/restore.
Creation counters stayed at two for the known and uncertain submissions.
Uncertain refresh and changed-credential recovery remained denied without
upstream contact; pending liability and customer accounting remained intact.
The same run passed text streaming, customer prepaid reconciliation, member
session restoration/logout, public catalog/docs/nested dashboard routes and
graceful drain. Disposable containers were cleaned up after success.

This checkpoint does not qualify live video entitlement, media downloads,
Compose video recovery, cross-image upgrades or every native case listed below.

Current-tree recheck passed on 2026-10-07 after rebuilding `niu-gateway`, through
migration 0149. Every native case below passed, including scoped Logs, tariff
replacement during generation, restart/restore and credential-rotation denial.
Runner cleanup now probes only its disposable PostgreSQL directory even when
startup readiness fails, kills and reaps an unresponsive Provider fixture, and
attempts database cleanup even if another process cleanup raises. All four cleanup
regression tests passed. Existing development services were not used or stopped.

## Verified native workflow

A fresh gateway build and `python3 scripts/native-video-recovery-smoke.py` passed.
The runner uses real management APIs to configure explicitly synthetic supply,
independent purchase/customer tariffs, membership, prepaid funding and scoped keys.
It never loads the development database, server configuration or credentials.

| Case | Observed result |
| --- | --- |
| Known job | One submission, queued/running/succeeded observations, terminal usage and one 10-nanounit USD customer debit. |
| Price changes during generation | The customer tariff changes after submission and before the first status refresh. The admitted job retains its original charge; a future estimate uses the replacement tariff and a 200-nanounit maximum liability. |
| Gateway restart | Explicit refresh queries the original job once; no repeated generation or customer debit. Saved billing and the replacement tariff remain unchanged. |
| PostgreSQL backup/restore | A dump is restored into a separate database and the gateway restarted with its original encryption key. The same status, historical charge, future tariff and exactly-once behavior remain intact. |
| Result reference deletion | Restored availability exposes only result-kind states. Authorized deletion acknowledges both kinds; another original-job refresh and gateway restart cannot restore their availability. Historical customer charges remain unchanged. The fixture URL is metadata-only and does not qualify media download. |
| Customer Logs investigation | A scoped viewer reads the saved video in request detail and list. Its customer charge/currency match historical billing after restart, restore and credential rotation; checked procurement/credential fields are absent. Foreign-workspace access returns 404. |
| Reader revocation | Revoke the ordinary scoped Logs reader through the public administration route. List and detail return 401 immediately and after another gateway restart. Existing customer debit and uncertain-job liability remain unchanged; upstream creation/query counters do not increase. |
| API-key revocation | Revoke the original workspace video key. Status, billing and refresh return 401 immediately and after restart. Existing accounting and the separate uncertain job retain their original state, with no upstream requests. |
| Unknown submission | A separate customer's accepted request lacks a job identity. Restart and restore preserve `submission_unknown`, its original 20-nanounit reservation and no debit. Refresh returns 409 without upstream contact. |
| Credential rotation | Rotation uses the current configuration revision. Refresh of the original route returns 409 before egress; saved status, billing and uncertain liability remain readable and unchanged. |

Authenticated upstream counters include accepted and rejected requests. Creation
counts stay at two across restart/restore: one known job and one uncertain job.
Known-job recovery adds exactly one query per explicit refresh. Unknown recovery
and credential-rotation denial add no upstream requests. Native processes are
stopped after the run; generated diagnostics and backups remain in a private
local directory.

## Reproduce

Requires PostgreSQL CLI tools on PATH and the supported Rust toolchain:

```sh
cargo build -p niu-gateway
python3 scripts/native-video-recovery-smoke.py
python3 -m unittest discover -s scripts/tests -p 'test_package_video*.py'
```

All 15 video fixture/setup tests passed, including authenticated local HTTP
behavior, historical charge comparison, replacement-tariff setup and customer Logs/privacy checks. Public
boundary and scoped whitespace checks passed. These controlled tests establish
neither live supply rights nor discounted pricing.

## Remaining qualification

- Extend packaged qualification beyond the executed direct video subset. Direct
  and Compose lifecycles passed through migration 0168 on 2026-10-08, but Compose
  does not run video recovery and neither run qualifies live media retrieval.
- Extend upgrade coverage to other supported historical versions and failure states; verify original-account recovery with an explicitly authorized
  replacement credential, live uncertain-submission resolution and callbacks.
- Qualify actual video/optional-frame retrieval, expiry and deletion. The fixture's
  reserved result URL is metadata only and cannot establish download support.
- Qualify each advertised live Supplier/model/channel/input combination. Fixture
  jobs are retained only while its upstream process remains alive.

## Current direct-image recheck — 2026-10-08

The direct package smoke passed again using `sha256:c0a522a54c465da03cf31fee0421ba2d663bee59abb434e02394b831c872a44d`, built from the current
worktree through migration 0168. The actual executed video scope is the known-job,
uncertain-job, tariff replacement, original-route recovery, restart/restore, scoped
Logs and credential-rotation subset described above. Exactly-once customer
accounting and no replay on unknown/rotated recovery passed. This does not qualify
live entitlement, reference-image generation, actual media download or the entire
video lifecycle. The distinct-image upgrade in the
[package checkpoint](regression-and-recovery-verification.md#current-package-qualification--2026-10-08)
originally qualified saved workspace/key records only. The additional video upgrade checkpoint below exercises jobs across the same image change.


## Video image-upgrade checkpoint — 2026-10-08

The opt-in video branch of `scripts/package-upgrade-smoke.py` passed between
previous image `sha256:6178588bbba45ecc5f3cdf0c00f84159bd29c2c3a8be8495fcb4812d076c0f5d`
and current image `sha256:c0a522a54c465da03cf31fee0421ba2d663bee59abb434e02394b831c872a44d`
(migrations through 0166 → 0168). Both packages ran unchanged against an isolated
PostgreSQL database and a controlled local Supplier fixture. The fixture network
namespace and counters survived replacement of the gateway container.

The previous package submitted a known job without polling it to completion,
changed future customer pricing, and created a separate unknown submission.
After injected migration failure and successful recovery, the new package queried
the original known job to completion and posted one 10-nanounit USD customer
charge under its admitted tariff. A future estimate used the replacement
200-nanounit maximum charge. Scoped Logs matched historical billing and denied a
foreign-workspace read; the unknown submission retained its 20-nanounit
reservation, no debit and refresh denial without upstream contact. Repeated
reconciliation did not duplicate the charge. Upstream creation remained at two.
Existing workspace/key authentication and immutable migration receipts also passed.

Reproduce with distinct pinned package digests:

```sh
NIU_UPGRADE_VIDEO=1 NIU_PREVIOUS_IMAGE=<previous-digest> NIU_IMAGE=<current-digest> python3 scripts/package-upgrade-smoke.py
```

All 53 package harness tests passed, including deferred submission without
refresh, saved-job completion without creation, repeated-generation rejection and
unknown-job egress detection. Disposable containers and the network were removed.
The earlier harness failures used an incorrect fixture base URL and duplicate
funding references; they do not establish a defect in either package.

This covers one controlled upgrade path with a queued known job and unknown
submission. It does not qualify live Supplier entitlement, live media transport,
callbacks, every prior version or all failure states. The current image predates
later dashboard and asset-handoff edits; this is not qualification of the entire
current worktree or a completed F01/F10 gate.


## Package recheck through 0171 — 2026-10-08

The [current package checkpoint](package-qualification-2026-10-08.md) repeats the
direct video and distinct-image upgrade checks against a fresh public-source
Linux/arm64 image. It also covers encrypted asset credentials and prepared request
preservation through upgrade and direct/Compose backup promotion, without granting
asset rights or sending creation. The older image evidence above remains scoped
to its original source. Live generation combinations and result delivery remain
unqualified.

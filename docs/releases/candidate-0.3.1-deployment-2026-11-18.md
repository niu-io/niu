# 0.3.1 staging replacement verification — 2026-11-18

## Subsequent integrated replacement

PR 212 integrated the scoped onboarding and member corrections into release commit `c3008ded8df5d2b9fcde1f3edd21f6986f463b22`. Its tree matched reviewed candidate `a65103517961041a75a17be66e8c527278caf12d`. That candidate's non-fixture Rust, web and documentation checks completed; actual package inspection confirmed released migration immutability and final public-boundary scanning of 4,243 files. These are build/artifact checks, not integrated behavior acceptance. Separate exact-release-tip checks were dispatched; their outstanding jobs are not claimed complete here.

Hosted composition `3450d3192af01a8d6ec6768b75c040afcb7f9a7e` pins that release commit, retaining the current previous dashboard (`18178194`, version 0.3.1 without a release date) and the bounded transition dashboard (`6fb59ef2`, version 0.3.0). The exact composition became live. All 248 independently captured previous-live resource URLs returned 200 with identical lengths and SHA-256 hashes, with no retries. Both `/healthz` and `/readyz` returned 200.

The authenticated document opened before replacement preserved its observation marker and performance time origin. It navigated from Overview to Usage after deployment, displayed the actual empty test-workspace data, and loaded one additional asset without an observed resource failure. Reloading subsequently restored workspace data. This establishes the observed old-document navigation and resource retention; it is not continuous availability measurement across deployment.

The actual hosted member follow-up is recorded in [member verification](member-readiness-0.3.1-findings-2026-11-18.md#integrated-hosted-verification). Direct SSH binary-version inspection was unavailable with the existing SSH authorization; the CLI fallback also did not resolve the service for execution. Do not describe a runtime binary version read as completed. The exact live composition, pinned build inputs, actual deployed assets and user journeys are the evidence available here. Production and published tags were not changed. Current-candidate acceptance cases were reset without inheriting earlier GREEN results, while previous assessments remain historical evidence in Beads.

## Earlier replacement record

Tracking: `niu-nrcn`, `niu-nrcn.1`, `niu-sdwx`.

## Immutable candidate

| Component | Revision |
| --- | --- |
| Core, version 0.3.1 | `18178194c24f1ea932165ee53a72cdc45f49207d` |
| Website | `8d3f49200f0d99d27dd39e17d71b904ee3b34108` |
| Hosted composition | `a9880be3ddb19024ec26cbba0b71e25b63900d64` |
| Plugins | `adc48be4698ebd184c3e3eab2c21f7df3fe93829` |

Version preparation merged through PR 204. Its actual package build, runtime
contents inspection and final static-asset scan completed. Required fixture
diagnostics executed, but their outcomes were disregarded. The exact merged release-tip public build completed in run `44226163500`.
Inspection of its actual logs confirmed the non-root runtime user, executable,
dashboard/docs/catalog assets and absence of source/dependency directories.
The final extracted runtime resources passed the public-boundary scan. These are
artifact-content checks, not runtime or installation acceptance. Required fixture
commands ran; their outcomes were disregarded.

The staging deployment of the pinned composition became live at 03:01 UTC.
Its workflow completed. Production configuration, production deployment and
published release tags were unchanged. This is an unpublished patch candidate.

## Current-input replacement observations

Before replacement, 248 linked JavaScript/CSS resources were actually fetched
from the live dashboard, recording lengths and SHA-256 hashes. After the new
composition became live, all 248 exact URLs returned 200 and identical bytes.
This verifies retained resource access, not general application correctness.

A browser logged in before replacement and retained its original document,
identified by an observation marker created at 02:54 UTC. After replacement,
that same document navigated to API Keys and displayed its existing records.
Its observed same-origin requests returned 200. About still showed version
0.3.0; reloading the page showed 0.3.1. Both screenshots were inspected.
The refreshed screenshot captured the version while surrounding workspace data
was still loading; it is not a complete settled-layout acceptance claim.

Fourteen actual authenticated session reads from the old document returned 200
with an authenticated actor. Their first sample was at 03:01:50 UTC, **after**
the reported deployment completion: these establish retained-session access
after replacement, not continuous authenticated sampling across the routing
switch. No in-flight inference stream was exercised in this run.

The completed independent public observation from 02:52:06 through 03:15:40 UTC
contained 240 health/readiness requests, all returning 200. Its observation log
has SHA-256 `3c3e7b3a645dc1a9bb24287bc47e245b6452b2c0a1e8a07e237a3e8c1ec6e648`. This finite window
spans the reported replacement. It does not resolve the previously observed
database interruptions or establish sustained availability.

After reloading, actual logout and fresh login succeeded. A separate session
read returned 200, an authenticated actor and operating mode `resale`. Final
logout returned 204, Login loaded, retained login material was removed and the
verification browser closed. No generation, payment or customer configuration
mutation occurred during this replacement inspection.

## Acceptance boundary

The parent gate and all eleven existing case records now identify the core,
website and composition above. No case inherited GREEN from earlier runs.
The record checker reports eleven UNTESTED cases and `ASSESSMENT_INCOMPLETE`;
that describes evidence completeness, not eleven product defects.

This record adds replacement, retained-resource and old/new-session evidence.
Full candidate journeys, database reliability, stream continuity and rollback,
real merchant settlement, remaining video qualification and independently
retrieved final published delivery artifacts still require their scoped evidence.
The entire accepted scope remains unchanged in Beads. No fixture outcome supports
any readiness or behavior claim.

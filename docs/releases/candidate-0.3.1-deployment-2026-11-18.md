# 0.3.1 staging replacement verification — 2026-11-18

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
diagnostics executed, but their outcomes were disregarded. Public checks were
also dispatched for the exact merged release tip; their completion remains a
separate record requirement.

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

The independent public observation prefix from 02:52:06 through 03:05:09 UTC
contained 134 health/readiness requests, all returning 200. This finite window
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

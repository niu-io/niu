# Agent key rotation drops delegated management access

Independent review, 2026-11-04. Tracking: `niu-ya50.2.2`; related hosted case: `niu-ayj.39` (KEY-02). The hosted case remains separately scoped to its pinned candidate and has not been rerun by this reproduction.

## User outcome and impact

An owner connects an agent with management access and later rotates its key as normal credential hygiene. Rotation should replace the secret while preserving the approved scope and expiry. In the reviewed revision, the replacement loses its delegated management permissions. A management-only connection can therefore stop managing routing after a successful rotation without the person intentionally revoking that access.

This is a lifecycle-continuity defect in the authorization model, not a cosmetic menu issue. It undermines the product promise that an agent can continue authorized work without another manual setup ceremony.

## Source and reproduction

Reviewed source: handoff commit `3d86c303e59542ae56e2a28d410400e0cdbc2a95`.

`Store::rotate_key_in_tx` in `crates/storage/src/keys.rs` copies model scope, invocation authority, absolute expiry, spending root and guardrail assignment. It does not transfer rows from `agent_key_capabilities`. The capability predicate in `agent_authorizations.rs` joins that table using the actual replacement key ID; its authorization check cannot find the original key's row. Migration0393 defines no rotation trigger that supplies the missing relationship.

The existing PostgreSQL test `management_grant_retains_discovery_but_refuses_dispatch_and_rotation_expansion` proves the original issued key has `pools:read`, then rotates it and verifies invocation remains disabled. Add this assertion immediately after authenticating the replacement:

```rust
assert!(
    store
        .agent_key_has_capability(scope, rotated.id, "pools:read")
        .await
        .unwrap(),
    "rotation must retain explicitly approved management access"
);
```

Run against a disposable database:

```sh
python3 scripts/test-postgres.py \
  management_grant_retains_discovery_but_refuses_dispatch_and_rotation_expansion \
  --package niu-storage --test agent_authorizations
```

This reproduction was executed in an isolated checkout, without altering the product implementation or the receiving developer's worktree. It failed at the new assertion: the replacement did not have the approved permission. Original approval, exchange, scope checks and rotation used the real storage methods and normal migrations. No upstream request or paid operation was involved.

## Countermeasure and acceptance

Carry the original explicit capability relationship into the replacement within the same atomic rotation transaction, preserving its authorization provenance. Recheck current approver membership through the existing predicates; do not turn rotation into a fresh broader grant. Preserve immutable history and distinguish the originally issued key from later replacements where that matters to audit semantics.

Verify all approved capabilities are retained exactly, unapproved capabilities remain denied, the old token no longer authenticates, and the replacement retains its fixed model scope, invocation flag, expiry and allowance root. Cover repeated/concurrent rotation, revoked or narrowed approver membership, capability introspection and a real non-inference management operation. Inspect revocation and audit readback after rotation so that fixing the capability rows does not leave lifecycle surfaces referring only to an obsolete credential.

This document proves the controlled storage failure for the reviewed commit. It does not establish a defect on another deployed revision, a fix, hosted acceptance, or complete agent-lifecycle readiness. Implementation belongs to the receiving developer and remains open in Beads until the required evidence exists.

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

## Receiving-worktree verification

Independent follow-up on 2026-11-04 inspected the receiving developer's uncommitted changes. The expanded storage test passed in disposable PostgreSQL: exact capabilities, fixed model scope, absolute expiry, spending root, old-token denial, repeated rotation, subscription continuity and approver-demotion denial were exercised. The implementation file `crates/storage/src/keys.rs` had SHA-256 `9f7c7d5f871dad025da099b48453a74493417cf26eb40f0dd01486f5d2b0b7f9`.

The connected gateway test **failed**:

```sh
python3 scripts/test-postgres.py \
  management_connection_denies_all_inference_protocols_before_execution \
  --package niu-gateway
```

Before currency setup, the authenticated rotation request returned503 `payment_setup_required` / `currency_required`, rather than200. The gateway test file had SHA-256 `c7478cb4e0612424801ac218cde0dd3b4e3eb6947b410be2e4b9ef8a0233a29c`. Compilation succeeded; the failure was an actual response assertion, not a build failure. Later inference-denial assertions were not reached in this run.

The path-based readiness gate still classifies credential-maintenance routes as paid workspace features. Track the shared prerequisite correction in `niu-ya50.3`. Authorized inspection, rotation, emergency revocation and receipt recovery must remain available without funding; role, scope and write protections still apply. Do not seed funds merely to avoid this first-use regression. Exercise both API route families, unavailable-merchant and no-currency states, foreign-scope denial, old-token denial and continued inference refusal. Source inspection also identifies revocation as payment-classified, but a separate revocation request has not yet been exercised.

These results apply only to the identified uncommitted files. They do not certify a published revision or deployed browser flow. The receiving agent stopped on an account-quota error; preserve its work and complete the remaining checks before closing either finding.

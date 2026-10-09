# Ordinary asset-operation authorization

The storage foundation records administrator-reviewed qualification for ordinary
Ark `CreateAssetGroup` operations. The record alone does not send upstream or
qualify the complete asset lifecycle. The subsequent
[platform runtime checkpoint](asset-group-runtime-verification.md) wires the
authorized handoff into one-shot administration creation.

Each immutable record binds one workspace, upstream account configuration revision and
asset credential revision. Separate SHA-256 references identify reviewed rights,
protocol, data-handling and free-operation evidence. Empty evidence and validity
outside one second to 90 days are rejected. Evidence references do not prove
entitlement on their own; reviewers must retain and assess the underlying records.
The accepted account is the direct Beijing Ark API configuration.

Checks require the exact workspace and revisions, unexpired authorization,
unrevoked qualification and usable, unrevoked asset credentials. New account or
credential revisions do not inherit authorization. Revocation is an immutable,
idempotent event with installation or operator attribution. Callers remain
responsible for enforcing platform administrator access. The storage handoff now
rechecks authorization atomically under its account lock; a standalone preflight check cannot authorize egress. The platform runtime uses
this handoff; customer routing and asset controls remain open.

Live entitlement and free-operation qualification, customer browser workflows,
complete ordinary asset CRUD,
readiness and separate consented liveness workflows remain open. No asset request
was sent upstream by this increment.

A PostgreSQL integration test passed on 2026-10-08 against migrations through
0169: missing authorization, exact revision and workspace isolation, immutable
records, idempotent revocation, expiry, evidence/duration validation and credential
revocation. This is storage evidence only, not live entitlement or end-to-end
asset acceptance.

All eleven existing PostgreSQL asset-management tests also passed with migration
0169, including original-account recovery, one-shot claims, concurrent credential
rotation, revocation, erasure, retention and uncertainty handling. Storage library
and authorization-test Clippy passed with warnings denied; changed Rust formatting,
whitespace and new-file public-boundary checks passed.

The administrator API and JavaScript SDK now provide create, bounded list and
account-scoped revocation controls. These are platform-only controls, not
customer asset CRUD or dispatch activation. Their verification is tracked
separately from the storage checkpoint above.

## Administrator API checkpoint — 2026-10-08

A routed PostgreSQL test passed against migrations through 0169. It verifies
ordinary workspace owners, inference keys and invalid credentials cannot create,
list or revoke qualifications; missing evidence, invalid duration/revisions,
unknown operations, mismatched workspace ownership and stale account revisions
are rejected. A successful record survives a new application state. A mismatched
account revocation leaves the original qualification intact; repeated matching
revocation is idempotent and durable. A real platform administrator can create
and revoke records, with the operator identity captured in the immutable event.
All administration responses retain the centralized no-store policy.

Fresh SDK compilation and all 148 JavaScript tests passed, including exact-body
projection, input bounds, cancellation and conflict handling without retries.
Gateway binary/test Clippy passed with warnings denied. Changed Rust formatting,
OpenAPI YAML parsing, whitespace and changed-source public-boundary checks passed.
No product UI was changed; this checkpoint does not claim rendered controls,
upstream dispatch, real Supplier rights, free-operation evidence or complete V08
acceptance. This API checkpoint predates the account-locked handoff integration below.


## Authorized handoff checkpoint — 2026-10-08

The one-shot credential handoff requires an unexpired, unrevoked qualification
matching the intent's workspace, account revision, credential revision and fixed
ordinary operation. It checks expiry again in the forward state transition.
Qualification creation, revocation and the claim use the same account lock,
serializing revocation against credential release. A successful claim saves an
immutable authorization receipt in the same transaction as the intent transition.
Old claims receive no fabricated receipt. Qualification references stay internal
and are absent from customer request projections.

Thirteen PostgreSQL tests passed against migrations through 0170. The new fixture
covers absent and foreign-workspace qualifications, expiry, an in-flight revocation
blocking a waiting claim, new credentials not inheriting an existing qualification,
receipt-write failure rolling the state back, immutable receipt binding and no
second claim after revocation. Original-account recovery and uncertainty completion
remain available for an already claimed operation; revocation does not authorize
another create or erase its history.

This is the authorization/receipt storage gate. The subsequent runtime checkpoint
adds bounded platform transport and durable outcomes. Customer creation controls,
complete recovery tools, live entitlement/free-operation evidence and complete
asset lifecycle acceptance remain open. No upstream
asset call was made and no UI was changed.

The routed administrator API regression also passed against migrations through
0170 after account-lock revocation was introduced. Storage library and both asset
test targets passed Clippy with warnings denied. Changed Rust formatting,
whitespace and public-boundary checks passed. Existing SDK contracts were unchanged
by this storage increment.

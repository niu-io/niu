# Ordinary asset group runtime

The platform administration API now has a one-shot ordinary creation path:
`POST /admin/v1/vendors/{id}/asset-management/groups`. It accepts an exact
workspace, account and asset credential revision, an idempotency key, name and
optional description. Platform access, workspace ownership, encrypted credential
binding and the atomic qualification gate precede dispatch. Only ordinary AIGC
creation is supported by this increment.

The production transport signs with a fresh UTC timestamp and sends the fixed
Beijing Ark action once. Response collection is bounded to 1 MiB and transport to
30 seconds, with a 35-second outer task deadline. Four operations can run at once;
excess new requests fail before saving a request. Exact already-claimed requests
return saved status without acquiring dispatch capacity or decrypting keys, including
after credential erasure and application restart. Accepted work continues after the
HTTP response and is included in graceful drain. A process failure leaves the
saved claim for reconciliation. Repeated requests return the saved claimed status;
conflicting or unqualified requests do not send. No uncertainty path permits
upstream create replay.

Measured transport duration, outcome and a fixed safe error category are saved in
an immutable audit event atomically with the state transition. The event references
the original qualification receipt. Management auditing does not debit a customer
balance or use inference pricing. Failure to persist an outcome leaves the
request unresolved; logs contain no keys, request content or upstream identifiers.
Request status can be read through the existing scoped workspace request API.

The JavaScript SDK adds `createOrdinaryAssetGroup`, validates Unicode name and
description bounds, preserves idempotency/cancellation and makes no implicit retry.
OpenAPI documents the platform-only boundary and accepted response semantics.

This is a platform configuration/testing path. The legacy `dispatch_available`
metadata flag remains false for the complete customer asset workflow. Customer
model/account selection, customer creation UI, full group/asset CRUD, readiness,
uncertainty reconciliation tools, timed visualization and real free-operation
qualification remain open. No live Ark entitlement or successful upstream creation
is established by controlled transport evidence. No product UI changed.


## Verification — 2026-10-08

Thirteen PostgreSQL storage tests passed against migrations through 0171,
including outcome-audit failure rolling the state back, scoped duration/error
reads, invalid outcomes rejected before mutation, authorization/receipt gates,
rotation, retention and no replay. All twelve isolated media asset tests passed,
including official signing vectors, strict receipt checks and transport failures
without replay. The isolated build also verifies the fresh UTC timestamp does not
rely on clock features enabled by another crate.

Fresh SDK compilation and all 149 JavaScript tests passed. Gateway, storage and
media all-target Clippy passed with warnings denied. OpenAPI YAML parsing and
changed-source public-boundary checks passed. This evidence does not qualify live
Ark access, real free-operation rights or the complete customer asset workflow.

The routed/internal gateway PostgreSQL regression passed on the final source with
migrations through 0171. Controlled transport verifies no send without qualification,
exact signer/request/qualification binding, saved status after the HTTP response,
no replay for dispatching/succeeded/uncertain requests, completion after subsequent
revocation, the four-operation capacity bound and graceful-drain tracking. Success
and safe uncertainty categories are durably recorded and cannot be erased. The
actual routed production handler rejects an ordinary workspace owner and missing
credential revisions before egress. The successful upstream operation is a
controlled fixture, not a live Ark call. Changed Rust formatting and whitespace
checks also passed.


## Saved-status recovery correction — 2026-10-08

The initial implementation acquired a dispatch slot and decrypted credentials
before matching an already accepted idempotency key. This unnecessarily blocked
saved status when capacity was full or original keys had been erased. The request
now matches its original workspace, account, credential revision and full canonical
body fingerprint first. Only claimed records return saved status; prepared records
still require capacity, usable original keys and the atomic qualification gate.
No erased content is reconstructed or restored by the lookup.

The PostgreSQL gateway regression passed with all four transport slots occupied,
then with erased management keys and a newly constructed application state without
an encryption runtime. Exact requests returned their original saved status without
calling transport; changed request content was rejected. Existing success,
uncertainty, scope, capacity and immutable audit checks also passed.

Gateway/storage all-target Clippy passed with warnings denied after this correction.
Changed Rust formatting, OpenAPI YAML parsing, whitespace and changed-source
public-boundary checks passed. No UI, SDK behavior, billing mutation or live
Supplier qualification was introduced by this correction.

## Private request-list cache protection — 2026-10-08

Workspace asset-request lists now send `Cache-Control: no-store`, matching the
request-detail endpoint. These responses contain private names and operation
statuses and must not be retained by HTTP caches. One matching isolated
PostgreSQL/API regression passed, asserting the header on both successful reads
alongside existing pagination, inference-key rejection, cross-workspace denial
and write-authorized content deletion checks. This does not erase responses
previously cached by clients or qualify the complete asset lifecycle.

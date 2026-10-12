# Frontend interface inventory and gaps

Updated 2026-10-12 after core integration `fb21b52a`. This is contract publication,
not whole-business acceptance. See the [current acceptance record](../reference/parallel-core-backend-acceptance.md).

## Delivered index

The [machine-readable interface index](backend-interface-inventory.json) now
contains 254 registered root-contract methods with resolved handler mappings:
Supplier 72; keys/inference/Guardrails 45; billing/pricing/payments 37; logs/usage 8;
video/media 42; access/workspaces 42; saved Chat 8. Resolve exact operation schemas
using each entry's contract source and operation pointer. SDK name matches are
navigation hints, never behavior evidence.

The initial `d6904064` inventory contained 236 methods and 20 uncovered root
methods. The fifteen member/Supplier/Guardrails methods and one media HEAD method
now have exact generated contracts and root references. Six missing member and
global-detector SDK helpers were added. Existing Supplier qualification and
workspace-detector SDK helpers were manually mapped to their actual envelopes.

## Explicit exclusions

Four registered methods remain outside this core JSON index: `GET /auth/callback`
(browser redirect) and the three legacy Codex-connection methods. They remain
implemented surfaces with separate ownership; no empty success replaces them.
Media-source HEAD is published as an empty 405 rejection and needs no JSON SDK.

## Workspace compatibility

New `PATCH` and `DELETE /admin/v1/workspaces/{workspace}` aliases and
`renameWorkspaceById` / `deleteWorkspaceById` SDK helpers retain the existing
legacy routes and methods. Actual native HTTP and compiled SDK runs verify both
route families, role/scoping equivalence, revision-independent rename persistence
and refusal to delete retained dependent data. Frontend compatibility freeze is
still an active handoff checkpoint; uncommitted legacy removal is not delivered.

## Exit status

S11-2 core root/handler schema coverage, SDK mapping and explicit exclusions are
recorded complete at their bounded evidence pins. S11-3 still requires frozen
integration handoff and documentation delivery verification. Successful static
builds do not qualify every business operation or rendered browser presentation.
Fixture outcomes have zero acceptance signal.

## Legacy company workspace checkpoint — 2026-10-12

The two previously missing workspace methods now have handler-generated schemas
and a root path reference in `d6904064`. The native `3fdc669c` implementation
contains the same unchanged handlers. Actual HTTP against a preserved database
copy returned 201 for creation and identical durable-key replay, with exactly one
new workspace; changed input under the same key returned 409. The list envelope
contained id/name records and matched after Gateway restart. A workspace-scoped
viewer saw only its authorized workspace, received 403 for creation and 404 for
a foreign company; revoked access returned 401.

Independent source/final PostgreSQL reopening confirmed the single new row,
revoked viewer and unchanged original business/financial fingerprints. Saved
HTTP digests, exact creation/replay objects and restart list equality were
checked separately. No inference, new funding or credit was introduced. This
closes these two interface-contract gaps, not M1 or full workspace qualification.

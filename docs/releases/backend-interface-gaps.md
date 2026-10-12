# Frontend interface inventory and gaps

Reviewed 2026-10-12 at committed baseline `d6904064`. Native implementation is
`3fdc669c`. This is milestone M1 of the [delivery plan](backend-delivery-plan.md).
It is an interface audit, not business acceptance or a declaration of readiness.

## Delivered index

[Machine-readable interface index](backend-interface-inventory.json) contains
236 registered root-contract methods. Each entry identifies method/path, handler,
contract file and operation pointer, security declaration, implementation
annotation and an exact SDK operation-name search hint. Resolve input, output,
parameter and error schemas at that pointer; this index does not duplicate or
replace OpenAPI. Names/UUIDs in paths are contract placeholders, not user data.

| Integration area | Indexed methods |
| --- | ---: |
| Supplier administration | 68 |
| Workspace keys, inference and Guardrails | 40 |
| Company billing, customer prices and payments | 37 |
| Requests, logs and usage | 8 |
| Video and media | 39 |
| Access and workspace foundation | 36 |
| Saved Chat | 8 |

All indexed methods were matched to a committed route handler. 122 declare
implemented in their operation annotations; 114 have no such annotation. An
unspecified annotation is not evidence of a stub or missing implementation.
111 have an exact SDK operation-name match; the others require manual mapping
because SDK helper names can differ. A text match does not verify SDK execution.
Security declarations alone do not prove role or tenant isolation.

## Gaps discovered by route-to-root comparison

The index records 20 registered methods not exposed as methods in the root
contract. They are existing handlers, not missing HTTP implementations. Do not
replace them with empty successes or claim their business paths are verified.

| Priority / category | Missing root method coverage | Next action |
| --- | --- | --- |
| M1 integration review | GET/PUT `/admin/v1/auth/profile` and `/admin/v1/auth/preferences` | Inspect handler authorization/input/output and SDK usage before publishing contracts. |
| Supplier capability coverage | Supplier and offer qualification PUT/revoke POST (four methods) | Publish contracts without treating commercial activation as a backend gate. No invented qualification. |
| Applicable Guardrails coverage | Seven detector/list/preview/decision/dispatch-denial methods | Verify exact operation schemas and current frontend usage; required content checks must remain fail closed. |
| Protocol detail | HEAD `/v1/media/sources/{token}` | Clarify HEAD behavior alongside GET; this is method coverage, not evidence that the media endpoint is unavailable. |
| Browser callback | GET `/auth/callback` | Classify browser redirect behavior separately from JSON SDK interfaces. |
| Excluded integration | Three Codex-connection methods | Record existing surface; do not expand this excluded integration as part of core backend delivery. |

Exact missing method/path strings are in
`registered_methods_missing_from_inventory` in the machine index. These are
static findings. Runtime behavior, authorization, schema precision and SDK
mapping remain unverified by this inventory; inspect actual evidence linked in
[workflow status](backend-workflow-status.md) for narrower proven behavior.

## Current integration corrections

The [integration contract](backend-integration-contract.md) now documents required
`ttl_seconds`, explicit null for no expiration, `expires_at_ms: null` metadata,
key/Chat paging, direct Chat detail, guarded saves and video observations.
Committed workspace rename/delete remains under the organization/workspace
legacy prefix. Uncommitted alternate routes are not delivered contracts.

## M1 exit status

**Not closed.** The next work is the listed root-contract blockers and manual SDK
mapping, followed by current HTTP envelope checks for the core inventory. Do not
start unrelated improvement work before resolving or explicitly classifying
these gaps. Docs build/HTTP/spec checks verify documentation delivery only;
fixture outcomes have zero acceptance signal and rendered-browser presentation
requires separate observation.

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

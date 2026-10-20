# Workspace creation compatibility

New clients should use `POST /api/v1/workspaces`, the public contract and SDK
entry point. `POST /admin/v1/workspaces` remains a supported alias registered
to the same handler. The legacy
`POST /admin/v1/organizations/{organization}/projects` endpoint delegates to the
same creation handler while retaining its `{id, organization_id, name}` response.
It does not maintain a separate authorization or persistence implementation.

Both endpoints accept the same optional `Idempotency-Key` and share the
actor-scoped receipt namespace. A retry can switch endpoints when its resolved
company and name remain identical and the canonical request omitted `slug`. An explicit `slug` is part of the idempotency input and must be replayed through the canonical endpoint. Changed input returns 409. Keep the original
key after an uncertain response; without a key, successful calls create distinct
workspaces. The canonical handler rechecks current member/session authorization
inside the creation transaction, including after idempotency lock waits.

The canonical `/api/v1/workspaces` route and its `/admin/v1/workspaces` alias
use the same method, request, response, authorization and receipt namespace.
The older organization/workspace creation route keeps its legacy response shape
and the replay restrictions above. No alias is removed by this documentation
update. The verification below predates the canonical-prefix guidance; it
does not represent a new execution against `/api/v1`.

## Current-input verification — 2026-10-11

A native gateway built from a clean main checkout plus this change exercised an
isolated copy of retained PostgreSQL billing data. Eight concurrent legacy calls
with one company-owner session and key returned the same workspace. Canonical
replay returned the same identity; changed input returned 409 and an invalid key
returned 400. A foreign company returned 404. Restart preserved replay identity,
and revoking the owner session made subsequent legacy creation return 401.

An independent process reopened the stopped database and checked the saved eight
responses, single workspace and creation receipt, key hash, revoked creator, and
unchanged original customer-ledger fingerprint. The original database and its
encrypted identity were not replaced. This run covers compatibility and replay;
it does not independently exercise revocation during a lock wait or qualify the
complete onboarding/UI workflow.

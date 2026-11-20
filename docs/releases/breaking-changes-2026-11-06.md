# Breaking changes and upgrade notes — 2026-11-06

These changes are intentional security/contract cleanups. They are not silent:
each old-client behavior now fails with an explicit status/remedy.

## Provider qualification review API removed (`niu-gh3`)

The legacy SHA-256 qualification review workflow is retired:

- `PUT /providers/{provider}/qualification`
- `POST /providers/{provider}/qualification/revoke`
- `PUT /providers/{provider}/offers/{offer}/qualification`
- `POST /providers/{provider}/offers/{offer}/qualification/revoke`

Old routes return **404**. The SDK `qualify*`/`revoke*Qualification` methods,
their input types, and the `qualification_status` response field are removed.
Use the explicit offer lifecycle instead:

- `PUT /providers/{provider}/offers/{offer}/authorization` with the exact
  current revision
- `DELETE /providers/{provider}/offers/{offer}/authorization/{authorization}`
- `PATCH /providers/{provider}/offers/{offer}` to pause.

Historical review rows and legacy eligibility functions are retained; no
historical approval is rewritten. Clients must upgrade before using these
operations. A regression test asserts the old routes are gone.

## Internal Provider connections require explicit `access_scope` (`niu-sluf`)

`POST /vendors` now accepts `access_scope: personal|internal`. In Internal
use, omitting both `access_scope` and `personal_organization_id` returns
**400** with an instruction to choose a scope; it is never silently bound to
the caller's account or granted cross-organization visibility.

Existing rows remain `personal` (private). To share a connection across
internal organizations, reconnect/update it explicitly as `internal`; do not
assume an old connection became shared. Resale rejects `internal`. Old clients
that supplied only `personal_organization_id` keep personal semantics.

## Unsupported native routing traits return 400 (`niu-ycg8.5`)

Preview/dispatch now normalize request traits per protocol and reject traits
the selected protocol cannot express with **400**, instead of silently
dropping them. Clients relying on silent drops must stop sending those traits
or choose a compatible protocol/model. Existing valid requests are unchanged.

## Media-rate save can provision/authorize an offer (`niu-wa8`)

Saving a Provider media purchase rate can create/authorize the exact offer
revision in the same user action. This is audited and idempotent per retry,
but it is a commercial-state change: review the dialog's enable copy and the
configured-model table. A mid-flow close can leave an offer without the new
rate; finish from Media rates.

## Rollback

All changes are additive to the database except the removal of the legacy
qualification write routes/methods. Rolling back the application restores the
old routes only if the matching older binary is deployed; the retired review
rows remain readable by the old code. Do not delete migrations 0420-0429.

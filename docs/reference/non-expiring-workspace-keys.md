# Explicit no-expiration workspace keys

Implemented and exercised on clean `67b0ed2`, reviewed 2026-10-12.
Fixture outcomes provide no evidence.

## API contract

Workspace key creation requires `ttl_seconds`:

- An integer from 1 to 31,536,000 keeps the existing finite lifetime.
- Explicit `null` creates a key without automatic expiration.
- Missing, zero, negative, noninteger or oversized finite values are rejected.

```json
{
  "name": "Service integration",
  "ttl_seconds": null
}
```

Workspace owners and installation administrators retain creation permissions;
viewers cannot create these keys. Existing model grants and all company,
workspace and key limits apply. The secret is returned once with no-store.

Complete-directory and paginated metadata return `expires_at_ms: null` for no
expiration and a numeric Unix timestamp for finite expiry. The property remains
required. `expired` is false for a key without expiration; revocation is a
separate status. Frontend consumers should render an explicit no-expiration
label for null rather than treating it as a date. The JavaScript SDK's
`WorkspaceKey.expires_at_ms` type is `number | null`.

## Persistence and rotation

The existing non-null PostgreSQL expiration column stores positive timestamp
infinity for the explicit no-expiration state. Existing authentication and
transactional dispatch comparisons retain their current semantics. Metadata
projects that state to null and never casts infinity to integer milliseconds.
No artificial distant expiration date or schema reset is used.

Rotation preserves the expiration state, grants and shared spending identity.
Policy histories and outstanding commitments remain attached to that lineage.
Metadata edits do not change the lifetime. Revocation still blocks new access.
The existing finite-only storage entry point delegates to the same issuance and
audit transaction, preserving its validation contract.

## Actual verification

An isolated stopped copy retained 1,010 real saved keys and 1,842 actual
request/charge records. An ordinary workspace owner created one explicit
no-expiration key and a two-second finite peer; a viewer's creation was denied.
Missing, zero, negative and oversized finite lifetime inputs returned 400.
The finite peer initially authenticated and then naturally returned 401 after
expiry, without clock or database tampering.

The no-expiration key received IP, RPM, TPM, concurrency and customer spending
policies, was renamed through the metadata API and completed an actual strict
marker model call. Its rotated replacement authenticated and completed another
actual call after Gateway restart. Both old/new metadata records retained null
expiration and false expired state; the old secret was rejected. Complete and
paged HTTP metadata and actual clean-SDK traversal agreed, including finite
numeric timestamps and the naturally expired peer.

Lowering the lineage spending ceiling to its exact posted charges rejected a
further request before another attempt. Revoking the replacement returned 401.
Independent native reopening verified positive infinity on both lineage records,
finite peer expiry, unchanged original finite metadata, all page/SDK fields and
ordering, shared policies and revocations. Saved response content/usage reproduced
two exact charges and equal debits totaling 34,693 USD nanounits. Final attempts,
charges and ledger entries total 1,844; existing history plus these calls totals
34,709,388 USD nanounits. No funding or outstanding hold appeared.

The native service was refreshed after a fresh isolated backup restore. Original
configuration, encrypted identities and durable business counts were preserved.
This verifies the exercised text, management, rotation/restart and spending paths;
no-expiration video lifecycles, every concurrent policy/admission race and
performance require their own current-input evidence. Earlier finite-only
checkpoints keep their original executable revisions and boundaries.


## JavaScript lifecycle client — 2026-10-12

SDK `c54457e` adds the complete management lifecycle against the existing backend
`67b0ed2` endpoints. Types are exported from the package entrypoint:
`WorkspaceKeyCreateInput`, `WorkspaceKeyMetadataInput`, and `IssuedWorkspaceKey`.

| Client method | HTTP operation | Result |
| --- | --- | --- |
| `createWorkspaceKey` | POST workspace key directory | One-time key reference/secret |
| `updateWorkspaceKey` | PATCH key metadata | Integer metadata revision |
| `rotateWorkspaceKey` | POST key rotation | One-time replacement reference/secret |
| `revokeWorkspaceKey` | DELETE key | Empty success; metadata/history retained |

```ts
const issued = await client.createWorkspaceKey(scope, {
  name: 'Service integration', ttl_seconds: null,
});
const { data } = await client.listWorkspaceKeys(scope);
const saved = data.find(key => key.id === issued.id);
if (saved) {
  await client.updateWorkspaceKey(scope, issued.id, {
    name: 'Renamed service integration', allowed_models: saved.allowed_models,
    expected_revision: saved.revision,
  });
}
const replacement = await client.rotateWorkspaceKey(scope, issued.id);
await client.revokeWorkspaceKey(scope, replacement.id);
```

Creation validates the explicit null-or-finite lifetime. Metadata revision is a
positive safe integer; policy API revisions remain decimal strings. Backend
permissions, model validation and optimistic concurrency remain authoritative.
Preserve one-time secrets securely; listing never returns them.

A fresh actual SDK run used an ordinary owner and viewer against a stopped copy
of the retained real-request database. A wrapped real fetch observed viewer
creation refusal (403), finite/no-expiration creation (201), metadata PATCH (200),
stale PATCH (409), rotation (201) and revocation (204). Successful issuance and
rotation carried no-store. Missing/zero SDK lifetimes raised TypeError before
any fetch. The finite peer expired naturally. Two actual model calls through the
original and restarted replacement produced exact customer charges/debits totaling
33,458 USD nanounits. Spending refusal added no request; revoked access returned
401. The clean SDK traversed all saved pages with exactly the HTTP metadata,
including explicit null expiration.

Independent reopening checked saved live-fetch observations, native metadata and
policy bindings, preserved infinity/finite lifetimes, response usage and exact
debits. Final request/charge/ledger counts were 1,844, with no open hold or funding
receipt. This is a separate run from the earlier 34,693-nanounit checkpoint;
requested markers and reported tokens differ. It does not establish every race,
media lifecycle or frontend presentation. Fixture outcomes provide no evidence.

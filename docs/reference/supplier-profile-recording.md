# Supplier profile recording

## Current-input checkpoint — 2026-10-12

Supplier profile edits keep their existing platform authorization, input
validation and optional expected-revision contract. Name, description, website
and logo metadata are updated in the same transaction as the immutable
`supplier_profile_updated` audit record. An empty optional string clears its
field; omission or null preserves its existing value. Profile edits do not
publish an offer, qualify supply or change routes or prices.

The transaction now uses the shared bounded recording helper, also used by the
existing financial recording paths. Its private name reflects recording rather
than assuming every caller posts money. The helper sets a 250 ms individual lock
wait and a 2 second individual statement deadline in the transaction only. It
does not bound pool acquisition or the complete HTTP operation; domain locking,
validation and commit remain in each caller.

An isolated copy with actual model-request charges created a Supplier through the
normal administration API. An independent PostgreSQL session held its row lock.
Before the change, a valid profile edit stayed pending until release after 1.6
seconds. The changed implementation returned HTTP 503 in approximately 257 ms
while that lock remained held. Reading the profile and audit history confirmed
neither had changed. Retry after release recorded one profile revision and one
audit event; reuse of the old expected revision returned HTTP 409.

A temporary database trigger then delayed only the profile audit insert for three
seconds, after the profile update had executed. The statement deadline returned
HTTP 503 and rolled back the preceding profile mutation as well as its audit
record. Removing the delay and retrying the same expected revision succeeded.
Gateway restart preserved the final profile and continued rejecting the stale
original revision. The temporary fault was removed from the isolated database.

Independent reopening matched the saved HTTP profile response to the stored
metadata and final revision, checked exactly one audit event for each of the two
successful edits, and verified PostgreSQL lock/statement-timeout diagnostics.
Customer invoice and audit counts were unchanged. A subsequent actual personal
OpenRouter model request produced one exact customer charge and equal ledger
debit, with no active reservation or new funding receipt. No Supplier earning,
settlement, commercial agreement or qualification was fabricated. No fixture
outcome is evidence for this checkpoint.

This covers the observed row contention and audit-stage rollback/retry paths.
It does not qualify every concurrent administration race or uncertain commit
outcome, nor does it constitute frontend or commercial Supplier acceptance.

Clean committed `138b577` repeated both fault/recovery paths with independent
final-artifact and reopened-database checks; its held-lock response took about
256 ms. The native Gateway then refreshed to this binary after a fresh backup
restore and full-row comparison. Configuration, encrypted vendor identities and
durable business record counts stayed unchanged on schema 277. Readiness and
authenticated published-routing status were available after refresh.


## JavaScript administration SDK

`NiuAdminClient.getSupplierProfile(supplierId)` returns `{ data: SupplierProfile }`.
`updateSupplierProfile(supplierId, input)` sends the existing PATCH contract and
returns the saved profile. The package exports `SupplierProfile` and
`SupplierProfileUpdate`. Supply the last read numeric `revision` as
`expected_revision`; the SDK rejects unsafe/nonpositive numeric revisions rather
than serializing a rounded JavaScript value. Server-side authorization and
validation remain authoritative. HTTP 409 is surfaced as `NiuAPIError`, never
silently retried as an unconditional update.

```typescript
const { data: profile } = await admin.getSupplierProfile(supplierId);
const { data: updated } = await admin.updateSupplierProfile(supplierId, {
  name: profile.name,
  website_url: "", // Clear; omitted or null would preserve the saved URL.
  expected_revision: profile.revision,
});
```

An isolated SDK build used committed source plus only these profile additions,
excluding unrelated shared-worktree changes. Against the actual pinned Gateway,
it set and trimmed metadata, retained omitted/null fields, explicitly cleared all
optional fields, and rejected stale revision, credential-bearing URL and
Supplier-manager read/write attempts with HTTP 409, 400 and 403 respectively.
Restart preserved the final profile. Independent reopening matched saved SDK
responses to the final revision and exactly three successful-update audits,
checked the existing customer debit pairs, and confirmed the temporary manager
was revoked. Source hashes matched the staged SDK files. No fixture outcome is
used as evidence; this does not claim rendered frontend acceptance.


## Supplier business lifecycle SDK

The administration client also exposes:

- `listSupplierBusinesses()` → `{ data: SupplierBusiness[] }` with name,
  configuration/model/member counts and explicit qualification status.
- `createSupplierBusiness(name)` → `{ data: { id } }`. Creation establishes an
  identity, not permission to resell supply or an active offer.
- `deleteSupplierBusiness(supplierId)` → `{ data: { deleted: true } }`. Existing
  configuration, offer or membership dependencies produce HTTP 409. Deletion
  retains audit history and removes the identity from the active directory.

`SupplierBusiness` is exported by the package. Backend provider-named routes
remain unchanged. These methods require platform administration; a company
owner's workspace or billing permissions do not grant directory access.

Current-input SDK verification created two business identities in an isolated
copy of actual request accounting. One acquired a disabled, encrypted personal
credential configuration and a disabled model binding; its directory counts
were one key and one model while qualification stayed `unqualified`. Deleting
this configured identity returned HTTP 409 and preserved its configuration.
The unconfigured identity was deleted successfully, disappeared from the
directory, returned HTTP 404 on profile read, and returned HTTP 409 on repeat
delete. A company owner received HTTP 403 for listing, creating and deleting.
Gateway restart retained the same directory and dependency rejection.

Independent reopening checked the single deletion audit, retained configuration
ownership and encrypted credential, disabled model binding, absent unauthorized
identity, revoked temporary owner and absence of qualification, earning or
funding records. The original two customer charge/debit pairs still matched.
The isolated SDK build excluded unrelated shared-worktree edits; tested source
hashes matched the staged changes. This validates lifecycle integration, not
commercial qualification, live inference or rendered frontend acceptance.

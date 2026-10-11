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


## Handler-generated business directory contracts

Supplier creation and the complete compatibility directory are now annotated at
their Rust handlers as `createProviderBusiness` and `listProviderBusinesses`.
Existing operation identifiers and routes remain unchanged. The root and legacy
Supplier contract both reference the generated definitions instead of separate
handwritten schemas. Names are limited to 100 UTF-8 bytes before trimming; the
schema's character limit is supplemented by this explicit byte restriction.
Directory schemas describe the exact identity, name, configuration/model/member
counts and qualification-status fields. Error responses retain actual platform
permission and typed-body behavior.

A current-input isolated Gateway run rejected blank names, an over-limit UTF-8
name, control characters, unknown body fields and a non-string name without
creating identities or audits. A 100-byte ASCII name and a whitespace-trimmed name
were accepted, survived restart and matched the returned directory. Independent
reopening found exactly those accepted identities and creation audits. Typed
JSON rejection returned the framework's text response; the verification script
was corrected to retain that actual response rather than assuming JSON.

Isolated handler generation and root-entrypoint checks completed, followed by an
offline-dependency docs build. HTTP reads of the generated operation page and
annotated JSON download returned 200; both business operation identifiers were
present, schemas matched, and download bytes equaled the generated contract.
Unrelated shared-worktree edits were preserved. This is contract/HTML and scoped
current-input API evidence, not browser visual acceptance or a claim that every
Supplier commercial workflow is complete. No fixture outcome is evidence.


## Atomic Supplier creation under contention

Reviewed 2026-10-12 on clean committed `d76c4d4`. Creation now uses the existing
bounded recording transaction, keeping the identity and creation audit in one
commit. Name validation and the ordinary POST contract remain unchanged.
Individual lock waits are limited to 250 ms and statements to 2 seconds; neither
pool acquisition nor whole HTTP duration is bounded by those settings.

An isolated current-input API run held a table lock that conflicts with Supplier
insertion. Before the change, creation waited until release after 1.6 seconds.
The changed committed binary returned HTTP 503 in about 257 ms while the lock
remained held, without an identity or audit. Release and retry created one
identity and one audit. A temporary trigger then delayed the creation audit after
a second identity insert. Its statement timeout rolled back both writes;
removing the fault and retrying succeeded. Restart retained exactly the two
successful identities. Independent reopening matched the directory artifact,
creation audits, both timeout diagnostics and removal of the fault.

Creation has no idempotency-key contract; another accepted POST can create another
identity. This checkpoint proves the observed failed transactions rolled back,
not every uncertain commit outcome or frontend retry workflow. No qualification,
earning or funding record was manufactured; no fixture outcome is evidence.

The native Gateway refreshed to `d76c4d4` after a fresh backup/restore and full-row
fingerprint comparison. Configuration, encrypted vendor identities and durable
business counts remained unchanged on schema 277. Readiness and authenticated
published-routing status were accessible after refresh. This pin also includes
the previously verified atomic Supplier membership change.


## Atomic Supplier deletion under contention

Reviewed 2026-10-12 on clean committed `bdf1a6d`. Deletion now uses the same
bounded recording helper as creation, profile updates and member changes.
The existing dependency guard, soft deletion and immutable audit remain in one
transaction. This does not change permission, route or response shape.

In an isolated current-input API run, a Supplier row lock kept an unconfigured
identity's deletion pending until release after 1.6 seconds. The changed binary
returned HTTP 503 in approximately 258 ms while that lock remained held, leaving
its profile and audit unchanged. Release and retry deleted it once; profile reads
returned 404 and repeat deletion returned 409. A delayed deletion-audit insert
then triggered the statement timeout after a second soft-delete update. Both the
deleted state and audit rolled back; removing the fault and retrying succeeded.
Restart retained the final directory.

A separate configured Supplier acquired an encrypted, disabled personal
credential. Its deletion returned HTTP 409 both before and after restart,
retaining the identity and configuration. Independent reopening verified exactly
one deletion audit for each of the two successfully deleted identities, no
deletion audit for the configured identity, retained encrypted ownership, both
timeout diagnostics and removal of the temporary fault. Existing customer
charges remained present; no earning, qualification or funding was fabricated.

The helper bounds individual lock waits to 250 ms and statements to 2 seconds,
not pool acquisition or whole HTTP duration. These observations cover the
exercised contention, rollback/retry and configuration-dependency paths, not
every concurrent deletion/configuration race or uncertain commit outcome.
No fixture outcome is evidence.

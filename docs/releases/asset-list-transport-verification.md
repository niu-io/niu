# Ordinary-group asset listing transport

Current status: the platform-only listing API supports original-group dispatch, encrypted page recovery, scoped audit history and bounded retained-parent continuation, with local evidence through migration 0178. The [current package checkpoint](package-qualification-2026-10-08.md) additionally verifies encrypted listing and audit recovery across direct/Compose restart and restore. Customer asset management, reusable references and live Supplier qualification remain open. The chronological checkpoints below distinguish each verified subset from the full V08–V10/V21 requirements.

## Initial transport checkpoint — 2026-10-08

Implemented against the [official Ark ListAssets contract](https://docs.volcengine.com/docs/ark/list-assets-api?lang=zh). This initial media-library checkpoint preceded gateway dispatch and customer controls.

The request targets one explicit ordinary group and original upstream project, with a page size of 1–100 and fixed creation-time descending ordering. It never requests account-wide results or real-person groups. Subsequent requests are constructed only from a validated response and retain the original group, project and page size. Private cursor values cannot be supplied independently or printed by the request type. A repeated cursor is rejected; there is no automatic pagination or retry.

Each returned item must match the exact group/project, have a valid unique asset identity, bounded name, known media type and status, and valid timestamps. Empty names are preserved without substituting identities. Optional last-inference time is an observation, not a task outcome. Metadata action/version/service/region, page size, cursor bounds and duplicate known fields are checked. Temporary access URLs, moderation payloads and raw upstream errors are discarded; upstream identities remain private integration data and must not become product labels. An Active observation does not itself authorize reuse or establish readiness for a configured generation channel.

Listing and group reads share bounded response handling: fixed signed POST, public DNS validation/pinning, no proxy/redirect/retry, a maximum 1 MiB body and a deadline no longer than 30 seconds including DNS and body reads. No endpoint override is exposed. Credentials and private responses have no diagnostic formatting implementation.

Fresh verification: all 29 media library unit tests passed, including four listing tests for scope, cursors, response validation and signing. The complete media suite passed 67 tests with one live TLS test ignored. Existing group-read response-bound/redirect tests and the official creation-signature vector passed after shared transport extraction. The first new oversized-page test fixture failed because it assigned outside a JSON array; the fixture was corrected before these passing runs. Media all-target Clippy passed with warnings denied; changed Rust formatting, whitespace and public-boundary checks passed. No live Supplier request was made.

Required next: exact operation-specific qualification, original-account claim/audit, encrypted page retention and recovery, bounded pagination across requests, revocation/erasure, customer authorization, reusable-reference integration, rendered lifecycle controls and live qualification. Existing creation and GetAssetGroup grants do not authorize ListAssets. No complete release gate is passed by this increment.

## Operation-specific listing qualification — 2026-10-08

Migration 0175 permits a distinct immutable ListAssets grant. Existing grants
retain their exact operation and evidence. The platform-only authorization API
and SDK accept listing explicitly; omission still means CreateAssetGroup. The
same nonzero evidence references, original workspace/account/credential revisions,
expiry bounds and revocation controls apply. Qualification checks do not claim
work, release credentials or activate dispatch.

One isolated storage PostgreSQL test passed through migration 0175, verifying
that simultaneous creation/read grants do not qualify listing, exact scope and
revision mismatches are denied, and listing revocation leaves both other grants
unchanged. One isolated gateway PostgreSQL test passed, verifying listing-only
qualification, ordinary-owner/inference-key/invalid-token denial, reconstruction
of administrative lists, independent revocation and no implicit creation/read
rights. All 154 SDK tests passed after a fresh build, including explicit listing
operation and cancellation forwarding. OpenAPI YAML parsing, changed formatting,
whitespace and public-boundary checks passed.

Gateway and storage all-target Clippy passed with warnings denied.

Encrypted pages, listing gateway dispatch and customer routing remain unimplemented;
no live listing was sent. Packaged upgrade qualification still ends at 0174.
Migration 0175 and the complete asset lifecycle remain unqualified for release.

## Atomic first-page claim and safe outcome — 2026-10-08

Migration 0176 adds immutable listing claims and outcomes. A claim locks the
original account, requires a successful saved ordinary group and a current
ListAssets grant for its exact workspace/account/credential revisions, validates
the original project and encrypted credential, and commits before handing off
the private fixed first-page request. Grant expiry is rechecked at insertion.
A duplicate identity cannot release credentials twice. No transaction spans
network I/O. Credential revocation prevents new claims; committed work can still
record its first outcome after qualification revocation.

Outcomes contain safe failure categories or a bounded item count/pagination flag,
plus measured duration. Failed counts remain unknown; a successful count cannot
exceed the claimed page size. These are listing observations, not readiness or
reuse authorization. Neither page bodies, names, signed URLs, upstream cursors
nor customer financial entries are stored by this audit.

One fresh isolated PostgreSQL test passed through migration 0176, covering
incomplete groups, creation/read-only grants, cross-workspace denial, request
bounds, concurrent duplicate claims, original signed group/project/page size,
independent revocation, credential revocation, safe outcomes, immutable first
completion and unchanged creation state and customer ledger. Initial test runs
failed on obsolete financial table names in the test assertion; the assertion
now checks the actual customer ledger, reservations and charges.

All four asset-authorization PostgreSQL tests then passed together through 0176,
including the existing creation/read qualification and handoff regressions.
Storage all-target Clippy passed with warnings denied; changed Rust formatting,
whitespace and public-boundary checks passed.

This is a first-page storage prerequisite. Encrypted page retention, durable
continuation binding, bounded multi-page discovery, gateway dispatch/recovery,
customer controls and live qualification remain required. No listing was sent
upstream, and package qualification still ends at 0174. No complete release gate
is qualified by migration 0176.

## Retained page storage and erasure — 2026-10-08

Migration 0177 adds bounded opaque ciphertext storage with a 24-hour expiry,
separate from immutable audit. Success outcome and content save in one
transaction. A failed content insertion rolls back its success outcome.
Claim-row locks serialize completion with scoped deletion. Immutable deletion
markers prevent content storage after deletion, including when the page is
still in flight. Stored content permits erasure only, never replacement or
restoration; audit survives. The existing retention worker independently erases
expired listing results in bounded batches without skipping other privacy
domains when cleanup fails.

Scoped recovery requires the exact original ListAssets grant, account/project
and usable credential revisions to remain current. Another grant cannot revive
content from a revoked grant. Expired content is denied immediately, independently
of cleanup. Deletion can still erase content after its grant has been revoked.
These storage methods require callers to authorize platform access and supply
validated authenticated-encrypted page bytes; they do not encrypt pages or
expose a recovery endpoint themselves.

All four asset-authorization PostgreSQL tests passed together through migration
0177. The expanded listing test verifies reconstructed Store access, foreign
workspace/vendor denial, immutable erasure, deletion before completion, atomic
rollback on forced result-insert failure, expiry through the existing retention
worker, original-grant revocation and unchanged customer financial records.
Storage all-target Clippy passed with warnings denied.
Opaque synthetic bytes test storage invariants only; no claim of valid page
encryption, decryption or backup restoration is made. Changed Rust formatting,
whitespace and public-boundary checks passed.

Required next: application authenticated encryption and validated snapshot
encoding, durable continuation binding, bounded multi-page discovery, gateway
execution/recovery/deletion, customer controls and live qualification. Packaged
qualification remains at 0174; no live listing or full release gate is qualified.

## Platform execution and encrypted recovery — 2026-10-08

Platform-only POST `/admin/v1/vendors/{id}/asset-management/listings` now joins
the original-group claim, fixed transport and atomic encrypted retention. It
accepts saved intent/listing identities and a page bound only. Four concurrent
listings are admitted without queuing. Detached, graceful-drain-tracked work has
a 35-second outer transport deadline around the 30-second/1 MiB transport; caller
disconnection does not remove claimed work or its first outcome.

Validated private snapshots omit signed URLs and raw errors. Authenticated
encryption uses a listing-specific domain bound to organization/workspace and
listing identity, separate from group-read content. Recovery loads the immutable
original group/project/page-size decoding context and revalidates the decrypted
page. POST and scoped GET return no-store descriptive projections: no upstream
asset/group identities, URLs or cursors. Scoped DELETE erases content and keeps
its tombstone and audit. Original qualification and platform access are checked
again before delivery. No inference charge or readiness mutation is introduced.

The matching isolated gateway PostgreSQL regression passed through migration
0177. It covers creation/read-only denial before egress, original signed scope,
private response projection, ciphertext privacy and wrong-identity/workspace/
domain rejection, duplicate one-shot identity, application reconstruction,
invalid-token denial, deletion, completion after caller abort, revocation during
transport withholding content and zero customer charges. Its first run lacked
the fixture's migration setup and failed before the operation; the corrected
fixture passed without weakening production checks. All 30 media unit tests,
all four asset storage PostgreSQL tests and all 156 SDK tests passed after fresh
builds. SDK methods validate scope/page bounds, forward cancellation and never
implicitly retry. OpenAPI and the API reference describe the subset.

Final snapshot review added a regression rejecting an internally constructed
next-page request without a cursor, preserving agreement with the audit flag.
All 30 media unit tests passed again after this guard. Media, storage and gateway
all-target Clippy then passed with warnings denied. Changed-source formatting,
OpenAPI YAML parsing, whitespace and public-boundary checks passed.

Continuation remains unexposed: has_more is an incomplete-inventory observation,
not complete discovery. Durable cursor continuation, full timeout/capacity and
role matrices, customer asset controls, reusable-reference integration, live
listing, and packaged recovery beyond 0174 remain unqualified. No UI or live
Supplier operation was exercised by this checkpoint.

## Retained-parent continuation — 2026-10-08

The platform listing API now accepts optional `previous_listing_id`. It decrypts
and validates that retained parent, derives the private next-page request, and
claims a fresh child identity before dispatch. Continuation preserves the exact
original grant, group, workspace, credential and page size. Migration 0178 stores
parent linkage, page number and the parent ciphertext digest; a unique constraint
permits only one child per parent. No raw cursor enters the public contract.

The storage claim checks current qualification, successful parent outcome,
unexpired non-erased ciphertext and exact snapshot equality under the account
lock. It rechecks grant and content expiry at insertion. Chains stop at 100 pages;
terminal or already consumed parents cannot dispatch again. A crashed child
remains a one-shot claim, without automatic replay rights.

Fresh isolated PostgreSQL checks passed all four asset authorization/storage
tests through migration 0178. Continuation checks include concurrent competing
children, cross-workspace and changed-scope/page-size denial, ciphertext mismatch,
self-parent denial, expired/deleted content and terminal pages. The 100-page
boundary uses seeded audit fixtures, not 100 network requests.

The gateway regression passed with controlled transport through migration 0178.
It verifies signing the retained private cursor, a terminal child response and
rejection of duplicate-child and terminal-parent requests before dispatch, while
retaining its encryption, recovery, deletion, caller-disconnection, revocation
and zero-charge checks. All 157 SDK tests passed after a fresh build, including
parent identity validation and omission of arbitrary cursor fields. OpenAPI and
the reference now describe the bounded continuation contract. All 30 media library
tests passed on the final source. Media, storage and gateway all-target Clippy
passed with warnings denied; changed-source formatting, OpenAPI YAML parsing,
whitespace and the 12-file public-boundary check passed.

These are local controlled checks. Complete inventory discovery, full timeout/
capacity and role matrices, customer controls, reusable asset integration, live
Supplier qualification and packaged recovery beyond migration 0174 remain open.
No UI or live Supplier operation was exercised by this increment.

## Retained child recovery and overload — 2026-10-08

The isolated gateway PostgreSQL regression passed again through migration 0178
with child-page GET after application reconstruction and after root-page deletion.
Each page has independent retained content; deleting the root does not silently
erase its saved child or authorize another root continuation.

The same run held four active listing dispatches, disconnected one caller and
verified that a fifth request returned 503 before claiming its durable identity.
All four held operations completed their audit outcomes after release. The
previously rejected identity was then admitted exactly once. This verifies the
four-slot overload/disconnection subset, not the full transport deadline matrix.

## Platform access matrix — 2026-10-08

The final gateway PostgreSQL regression passed through migration 0178 with real
workspace Owner, Admin and Viewer sessions denied on listing POST, retained-page
GET and DELETE. Denied POST identities had no durable claims. Inference API keys
were denied on all three methods. A platform-administrator session recovered the
same retained child page as installation authority. The same passing run retained
all recovery, erasure, overload, disconnection, continuation and revocation checks.
The initial matrix fixture used a nonexistent session field and failed compilation;
correcting it to the existing operator identity contract required no production
authorization change.

This closes the tested scoped-role and overload subsets. Full deadline behavior,
Supplier/member access variants, complete asset CRUD and customer lifecycle
acceptance remain open. No live request or rendered UI was used by these checks.

Final gateway all-target Clippy passed with warnings denied after the expanded
fixture. Changed Rust formatting, whitespace, listing OpenAPI continuation
parsing and the three-file public-boundary check passed. SDK and media production
source were unchanged by this recovery/access increment.

## Durable listing audit API — 2026-10-08

Platform GET `/admin/v1/vendors/{id}/asset-management/listings` now exposes scoped,
newest-first operational history with stable claim-time/identity pagination. The
SDK provides `listOrdinaryAssetListings`, with cancellation and validated page/
cursor inputs. A page contains at most 100 records; unknown or out-of-scope cursors
return an empty page. Responses are no-store and make no upstream call.

Records retain listing/parent API routing references, page number, outcome,
claim/completion time, measured gateway duration, safe failure category and
observed item count/next-page availability. Unknown completion remains unresolved
with null completion/duration/count/availability. It does not mean work is running
or permit replay. Private asset descriptions, upstream identities/cursors,
credentials, errors and prices are excluded. History survives retained-content
erasure and grant/credential revocation; platform authorization remains required.

Fresh isolated PostgreSQL verification passed all four asset authorization/storage
tests through migration 0178. History traversed more than 100 audit fixtures in
bounded pages without duplicates after credential revocation, rejected invalid
limits and unknown/out-of-scope cursors, and omitted private content. The expanded
gateway regression passed with actual GET route checks for unresolved/success/
failure records, parent/page linkage, one-record pagination, scope/cursor/limit
isolation, denied workspace roles/inference keys and Cache-Control no-store after
grant revocation. Its existing execution, continuation, recovery, deletion and
capacity checks also passed. All 158 SDK tests passed after a fresh build.

OpenAPI and the API reference describe the operational subset. This does not
supply customer asset management, readiness-aware references, full CRUD, live
Supplier qualification or packaged acceptance beyond migration 0174. No UI or live
Supplier operation was exercised.

Final storage/gateway all-target Clippy passed with warnings denied after the
history implementation. Changed Rust formatting, OpenAPI history parsing,
whitespace and the 12-file public-boundary check passed. Package qualification
remains at migration 0174 and does not cover this newer API.

## Packaged recovery through 0178 — 2026-10-08

The [corrected Linux/arm64 image](package-qualification-2026-10-08.md) passed direct
and Compose restart and backup/restore checks with production-compatible encrypted
root/child page fixtures. Packaged GET decrypts and validates both pages, and audit
history preserves parent linkage, page numbers, ciphertext/parent digests, outcome
timings and unresolved null fields. All 62 package harness tests passed. Fixtures
are explicitly synthetic and send no Supplier request. The distinct 0174 → 0178
upgrade also passed, but contains no preexisting listing results because the old
schema lacks those tables. Full CRUD, customer controls, reusable references and
live Supplier qualification remain open. Earlier package limits above describe
historical checkpoints.

# Targeted ordinary asset-group read

**Current package checkpoint:** the [0178 Linux/arm64 qualification](package-qualification-2026-10-08.md) covers direct and Compose restart/restore plus a distinct 0174 → 0178 upgrade with fault recovery. Prepared asset requests/credentials and current encrypted listing fixtures have scoped preservation evidence. Existing group-read claims and encrypted group-read results were not seeded and remain recovery-unqualified. Earlier migration limits below are historical. No live asset read or full V08–V10 gate is qualified.

The media library now implements the fixed Beijing Ark `GetAssetGroup` action,
following the [official contract](https://docs.volcengine.com/docs/ark/get-asset-group-api?lang=zh).
It signs an explicit original upstream group and project with AK/SK. It does not
accept an endpoint or action override or silently select the default project.

The production path uses fresh UTC signing, public-address DNS validation and
pinned resolution, no redirects/proxies/retries, a shared network/read deadline,
and a response bound of at most 1 MiB. Typed decoding rejects duplicate known
fields, error envelopes, wrong action/version/service/region, different group or
project, real-person group types and malformed names/descriptions/timestamps.
Only descriptive fields are returned; raw upstream identities, URLs, errors and
credentials are not included in the result type or diagnostic formatting.

This is an internal transport prerequisite, not an exposed customer operation.
Callers still need current workspace access, original-account credential binding,
operation-specific qualification and durable audit before dispatch. An earlier
creation authorization does not authorize reads. Account-wide listing, gateway
read routing, persistence/reconciliation, group/asset mutation and customer UI
remain open. A group description does not prove asset readiness or entitlement.

Verification on 2026-10-08: all 25 media library unit tests passed, including the
existing official create-signing vector after shared signer extraction and three
new targeted-read regressions. These cover original-project signature binding,
identity/scope/type/metadata rejection, duplicate identity fields, bounded
response reads, redirects, missing resources and a controlled successful read.
Local response fixtures do not weaken production HTTPS rules or establish live
Ark access. No billing or UI behavior changed.

Media all-target Clippy passed with warnings denied. Changed-source formatting,
whitespace and public-boundary checks passed. No complete V08–V10 or F01–F10 gate
is qualified by this transport increment.

## Operation-specific storage grants — 2026-10-08

Migration 0172 permits a separate immutable `GetAssetGroup` qualification while
preserving every existing creation grant unchanged. The storage API exposes
separate read qualification/check methods, reusing the reviewed evidence,
original account/credential revision, expiry and revocation boundaries. Neither
operation grants the other. This storage prerequisite does not enable read dispatch. API/SDK qualification
controls are verified separately below.

One matching isolated PostgreSQL regression passed through migration 0172. It
checks both directions of operation separation, read scope/account/credential
mismatches and independent revocation, alongside the existing creation expiry,
immutability and credential-revocation cases. Atomic read claim/audit, reviewed
API/SDK controls and gateway credential handoff remain required before egress.

Storage library Clippy passed with warnings denied. Changed-source formatting,
whitespace and public-boundary checks passed. Package upgrade qualification
currently covers migration 0171 and must be renewed for 0172 before release.


## Reviewed API and SDK controls — 2026-10-08

The existing platform-only qualification endpoint now accepts optional
`operation: GetAssetGroup`. Omitting it retains creation-only behavior; unsupported
operations are rejected. Responses and administrative lists identify the exact
operation. The SDK validates and sends only the two supported values, retains
cancellation and makes no implicit retry. OpenAPI and the API reference match.

One matching isolated gateway PostgreSQL regression passed through migration
0172. It verifies the old default, explicit read creation/list/revocation across
reopened application state, ordinary-owner/inference-key/invalid-token denial and
read-only permission separation. All 150 JavaScript SDK tests passed after a
fresh build. OpenAPI YAML parsing, changed-source formatting, whitespace and
public-boundary checks passed. Atomic read claim/audit and gateway transport
handoff remain open; no read request was sent to a live Supplier.

## Atomic read claim and durable outcome — 2026-10-08

Migration 0173 adds immutable read claims and first-outcome audit records.
`claim_asset_group_read` uses the same account lock as qualification revocation
and account/credential changes. It requires a successful saved creation, its
original group/project/account/credential revision and an exact unexpired,
unrevoked `GetAssetGroup` grant. Expiry is rechecked at insertion. The claim
commits before releasing encrypted credentials and the validated read request.
A repeated read identifier never releases credentials again. No lock is held
across later network I/O.

Outcome recording accepts only fixed safe categories and a nonnegative measured
duration. It is workspace-scoped and append-only; a later response cannot replace
an existing outcome. Revocation stops new claims but does not erase the outcome
of already claimed work. No descriptive upstream content, billing entry or asset
readiness mutation is stored by this audit.

One matching isolated PostgreSQL regression passed through migration 0173.
Coverage includes incomplete creation, creation-only qualification, cross-workspace
access, concurrent duplicate claims, exact original signed request fields,
independent read revocation, immutable first outcome, credential revocation and
zero customer charge/reservation/ledger rows. Gateway bounded execution, retained
read results, recovery/read APIs and the rendered lifecycle remain open. This
storage check does not qualify live access or the complete asset workflow.

Storage all-target Clippy passed with warnings denied; changed-source formatting,
whitespace and public-boundary checks passed. The packaged migration checkpoint
must be renewed beyond 0171; neither 0172 nor 0173 has packaged upgrade evidence.

## Bounded platform read runtime — 2026-10-08

The platform-only `POST /admin/v1/vendors/{id}/asset-management/group-reads`
loads a saved successful group in the exact workspace/account. It permits four
concurrent reads, commits the scoped read claim before decrypting the original
credential, and runs the fixed transport in a detached graceful-drain-tracked
task with a 35-second outer deadline. The first outcome is saved before delivery.
Current platform access and read qualification are rechecked before returning
private descriptive content. No upstream identity or raw failure is returned.

One matching isolated gateway PostgreSQL regression passed through migration
0173. Controlled transport covers creation-only denial before send, exact signed
original identity/project, duplicate/foreign-account denial, routed invalid-token
denial, no-store descriptive response, durable completion after caller abort,
revocation during transport withholding content while retaining its outcome, and
zero customer charges. These checks do not qualify live Ark access or the full
capacity/timeout matrix. All 151 JavaScript SDK tests passed; a subsequent build
also verified the new exported input type. OpenAPI and the reference describe
one-shot identity, cancellation, result fields and unavailable retained recovery.

Descriptive results are currently delivered directly and are not retained for
recovery. A fresh authorized read can use a new identity; no automatic retry is
introduced. Durable result retention/recovery, customer routing/UI, full asset
CRUD/readiness and package qualification through 0173 remain open.

Gateway all-target Clippy passed with warnings denied. Changed Rust formatting,
OpenAPI YAML parsing, whitespace and public-boundary checks passed. No full
release gate is qualified by this platform runtime increment.

## Encrypted result recovery and erasure — 2026-10-08

Migration 0174 adds encrypted descriptive result retention separate from immutable
audit. Successful outcome and ciphertext save atomically. Results bind to the
workspace and read identity through a dedicated authenticated-encryption domain
and expire after 24 hours. Scoped platform GET recovers saved content without
network dispatch, requiring the original grant, account and credential binding
to remain current. GET and successful POST return no-store responses.

Scoped DELETE records an immutable deletion marker, including before completion.
Claim-row locking serializes completion with deletion; late content cannot be
stored after deletion. Existing ciphertext permits erasure only, never replacement
or restoration. Expiry blocks reads immediately and the request-content retention
worker erases expired ciphertext in independent bounded batches. Immutable audit
survives; upstream resources and billing are unchanged. Backup retention remains
an operational responsibility.

One matching isolated PostgreSQL/gateway regression passed through migration
0174, adding reconstructed-application recovery, ciphertext privacy and wrong
read/workspace decryption rejection, scoped reads, deletion/restore rejection,
expiry cleanup, in-flight deletion and atomic rollback when result insertion
fails. Existing original-account, duplicate, disconnect and revocation checks
also passed. All 152 JavaScript SDK tests passed after a fresh build. OpenAPI and
the reference document scoped recovery and deletion, one-shot upstream reads and
retention. No UI or live Supplier read was introduced; complete asset CRUD,
readiness, customer controls and packaged upgrade through 0174 remain open.

Gateway and storage all-target Clippy passed with warnings denied. Changed Rust
formatting, OpenAPI YAML parsing, whitespace and public-boundary checks passed.
The package evidence still ends at migration 0171; this checkpoint does not close
V08–V10 or any full release gate.

## Scoped outcome history and timing — 2026-10-08

The platform-only collection GET now lists bounded workspace/account read audit
metadata in chronological cursor order. It exposes local claim/completion times,
measured gateway duration and fixed safe failure reasons. A claim without an
outcome is `unresolved`, never a promise that upstream work remains running.
Names, descriptions, ciphertext, upstream identities and qualification evidence
are excluded. Audit remains discoverable after content deletion or grant
revocation without restoring content access. No Supplier query or retry occurs.

One matching isolated gateway/PostgreSQL regression passed through migration
0174, covering all three outcome states, null unknown timings, safe projection,
complete one-row cursor traversal without duplicates, invalid limits,
invalid-token denial, foreign workspace/account isolation and no-store responses.
Existing recovery, deletion, rollback and revocation checks also passed. All 153
JavaScript SDK tests passed after a fresh build. OpenAPI parsing and changed-source
formatting, whitespace and public-boundary checks passed. Supplier queue/run
measurements, rendered asset diagnostics and the complete lifecycle remain open.

Gateway/storage all-target Clippy passed with warnings denied. This checkpoint
adds no UI and does not qualify live media, full asset lifecycle or a release gate.

## Concurrent capacity and disconnect qualification — 2026-10-08

The isolated gateway/PostgreSQL regression now holds four reads inside controlled
transport and aborts one HTTP caller. A fifth read receives HTTP 503 before any
durable claim or transport call; disconnecting a caller does not free its worker's
slot. After release, all four workers persist outcomes, including the detached
worker. The previously rejected read identity is then admitted exactly once.
Existing original-account, erasure, retention, history and zero-customer-charge
checks pass in the same test through migration 0174.

The final matching test passed (one test, 0.83 seconds after compilation), with
fresh disposable PostgreSQL and no development credentials. Changed Rust
formatting, whitespace and public-boundary checks passed. This qualifies the
controlled capacity/disconnect case, not live Ark behavior, the full timeout
matrix, encrypted-result backup recovery or any complete release gate. Product
runtime code and UI did not change.

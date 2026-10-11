# Customer media invoice integration

Date: 2026-10-10. Backend implementation checkpoint, not completed paid-flow qualification.

## Implemented behavior

Migration 0219 adds a shared view of immutable text and media customer charges.
It preserves existing invoice entries and replaces their text-only foreign key
with a scoped attempt foreign key plus a source-validation trigger. New entries
must have exactly one customer charge with the invoice's currency, workspace and
dispatch period. Supplier purchase prices are not part of this view.

Issuance sums and links both customer ledgers in the same transaction. Missing
media charges or positive media charges awaiting their matching balance debit
block issuance. The latter prevents an unsettled media overrun from becoming an
external invoice receivable while balance recovery can still debit it.

Billing totals and settlement status use the same source view. Invoice details
preserve text groups in `data` and add `media_lines`: customer model alias,
currency, exact charge, meter, tariff revision, rational measured and billable
quantities, discount revisions and the liability-bound flag. No complete pricing
snapshot or Supplier expense is serialized.

Media details are ordered by an immutable cursor, with at most 100 lines per
page. Pass `media_next_cursor` as `media_after` until it is null. Text groups repeat
on each page. The JavaScript SDK accepts the cursor as the optional fourth
argument to `getCustomerInvoiceLines`.

## Current-input observations

- A private backup preceded migration of the existing development database.
  The gateway reached readiness with migration 219 recorded successfully.
- Actual billing and invoice-detail reads returned HTTP 200. The current
  database has no customer charge or invoice records; the empty response was
  checked against an independent database read.
- Actual initial and cursor-based media-detail reads returned HTTP 200 with
  empty arrays and a null next cursor; a malformed cursor returned HTTP 400.
- An actual attempt to issue an empty historical interval returned HTTP 409.
  An independent read confirmed that no invoice was created.
- A separate empty native PostgreSQL cluster migrated through 219. Management
  APIs created a personal Supplier route, workspace and key. Real upstream
  calls before and after gateway restart matched persisted usage and retained
  payloads. Revocation denied another call without dispatch. The original
  credential identity was unchanged, and the isolated servers were stopped.
- Rust compilation/static checks, SDK compilation and contract parsing completed.
  No fixture outcome is used as business evidence.

## Remaining work

Positive customer media invoices, mixed invoices, pending media-overrun
rejection, source-trigger rejection, populated cursor traversal and paid
settlement remain unverified. The clean bootstrap covers upgrade compatibility
and owner-funded inference, not these financial branches.

Frontend rendering and pagination are separate integration work. Historical
invoice totals are not rewritten. A pre-upgrade text-only invoice still occupies
its original currency/period; issuing retrospective media supplements for that
same interval is not implemented. This limitation must be resolved before
claiming complete historical media invoicing support.

## Consistent posted-media status

Video billing detail and recovery scheduling now use the existing
`customer_activity_charges` view when deciding whether a recorded media charge
is posted. This aligns them with Logs: a positive amount requires a debit matching
the customer scope, attempt, currency and amount; a zero amount requires released
reservation state. Merely finding an arbitrary charge entry is insufficient.
The change does not create or alter financial entries.

On the updated native runtime, current HTTP reads of an actual retained successful
owner-funded video preserved history, job status and null customer charges through
both key and dashboard-session billing routes. Foreign-viewer and revoked-key
access were denied, response shapes matched the generated contract, and independent
SQL counts of transport observations and financial entries were unchanged. Existing
configuration and encrypted identity were preserved during process replacement.
This exercises the owner-funded read path only. Positive media settlement, mismatched
debit diagnosis and recovery scheduling against a nonempty paid-media backlog
remain unverified; no paid-media records were fabricated for this checkpoint.

The same posted-charge predicate also governs when background polling may stop
and which completed priced attempts the storage recovery-candidate query returns.
A recorded but unposted media liability must remain eligible for recovery. The
candidate method currently has no production caller; this change does not expose
a new manual-recovery endpoint. The rebuilt native service repeated the retained
owner-funded video read and authorization checks above, with unchanged financial
counts. These reads do not exercise the paid recovery branches, which remain
unverified.

Settlement retries now use that same posted-charge view before returning an
existing charge as successfully settled, including the bound account currency.
An unrelated or mismatched debit cannot make the retry report success and stop
background recovery. Ledger uniqueness and the existing transaction continue to
guard writes; this does not rewrite a conflicting debit or forgive its liability.
The nonempty paid-media retry and mismatched-debit branches remain unverified.

## Financial recovery without video polling

Customer media settlement now has a durable stage in the existing financial
worker. A completed job with saved success evidence and an unposted customer
charge remains eligible even when `NIU_VIDEO_POLLING=false`. Failed/conflicting
jobs are excluded. Missing or conflicting usage remains unresolved; the worker
uses the original pricing and usage, never a new upstream request. Supplier
earnings continue through their existing independent financial stage.

The media stage shares the financial advisory lock, bounded single connection,
100-attempt keyset traversal, durable cursor and per-attempt savepoint. Its
settlement implementation is shared with the direct video path. Insufficient
funding commits the immutable liability while retaining the hold, reports a
sanitized retry failure and permits later funding reconciliation. Other errors
roll back the attempt savepoint. Migration 250 adds only the recovery stage.

Current-input verification started a native Gateway against a fresh PostgreSQL
instance with video polling disabled and the admission pool limited to one
connection. Migration 250 applied, the media stage timestamp advanced across
multiple scheduled ticks and process replacement, and an API-created organization
survived. Independently reopening the stopped database confirmed the durable
stage and organization, with no attempts or financial entries. This verifies
worker startup/traversal on an empty backlog, not paid media settlement.

After a private pre-upgrade backup, the existing native installation applied
migration 250 without changing configuration, encrypted credential identities
or durable business record counts. Actual retained owner-funded video reads and
foreign/revoked access checks were repeated; financial and transport counts stayed
unchanged. Nonempty paid-media recovery, insufficient-funding retry and populated
cursor traversal remain unverified. Build and static checks completed separately;
no fixture results are used as evidence.

## Recovering saved success after interruption

Migration 251 adds a `media_completion` stage before financial settlement stages.
It restores completion for a bound job still marked `may_have_executed` when
durable observations contain success and no failure. It reuses the direct query
path's completion checks within the existing worker transaction. It does not
create usage, charges, earnings, or new upstream requests. Missing/conflicting
terminal evidence is left unresolved. This closes the interruption window between
saving a success observation and committing the attempt's completion state, even
when the original key is revoked and optional video polling is disabled.

An actual current owner-funded video request exercised this window in an isolated
PostgreSQL instance: a temporary trigger rejected completion updates while the
real upstream success observation persisted. The original key was then revoked,
the Gateway stopped, and the fault removed. With polling disabled and one
admission connection, restart restored `confirmed_completed` without another
transport observation. Only one generation submission existed and no customer
charge was created.

The first result download returned 404: the failed completion update had stopped
the handler before it saved the encrypted result reference. Explicitly refreshing
the same job restored that reference, after which the video downloaded and fully
decoded. Independent reopening of the stopped database and rehashing/decoding the
file confirmed the final state, one submission, revoked keys, removed fault and
no financial entries. Another restart preserved completion. This verifies
automatic state recovery, but **at this checkpoint automatic result-reference recovery for this
interruption remained incomplete**; it required an authorized refresh (see the subsequent atomic persistence change below).
The run does not qualify paid-media settlement.

The native installation subsequently applied migration 251 after a private
backup, preserving configuration, encrypted identity and business record counts.
Existing owner-funded video read/authorization checks were repeated.

## Atomic query evidence and result references

The Gateway now encrypts returned result references before handing a validated
query observation to storage. Storage commits receipt metadata, reported model,
status and those encrypted references in one transaction, before completion
marking and independent settlement. An error in reference storage rolls back
that observation; a later completion/settlement error cannot discard references
from the committed observation. No plaintext result URL enters the database.

The transaction reuses the existing reference upsert, including its deletion
and expiry protections. Conflicting terminal status remains inaccessible and
does not publish new references. The legacy storage observation method delegates
with no references for callers that do not have encrypted results. No schema or
public HTTP contract changes are required.

A new actual owner-funded video request repeated the isolated completion-write
fault. Success and an encrypted video reference committed while the completion
update failed. After revoking the original key, stopping the Gateway and removing
the fault, restart with polling disabled and one admission connection restored
completion without a new query. A newly authorized reader downloaded the result
without an extra refresh; the full video decoded. A second restart preserved
completion, with one generation submission and no customer charges.

Independent reopening of the stopped database confirmed the saved encrypted
reference, success/completion state, revoked reader keys, removed fault and empty
customer ledgers. The downloaded file's SHA-256 matched its receipt and a separate
FFmpeg run decoded the entire video. This closes the demonstrated completion-write
interruption for newly observed results. Historical observations that already
lost their result reference still require an authorized refresh; expiring upstream
URLs and paid-media settlement remain separate verification requirements.

### Deletion after atomic result persistence

A current HTTP run used a stopped-database copy of the actual recovered video
above. Download initially returned 200. Deleting through the workspace-key result
API returned 200 with `deleted: true`; subsequent download returned 404. A real
upstream refresh returned 200, but neither it nor Gateway process replacement
restored the deleted video/last-frame references. Both tombstones and their expiry
values stayed unchanged; ciphertext remained absent. No new generation was
submitted and financial entry counts were unchanged.

Independent reopening of the stopped database confirmed both tombstones, absent
ciphertext, one original generation submission and unchanged customer ledger.
Saved availability responses after deletion, refresh and restart were identical
and reported both results unavailable. The original retained database and native
installation were not modified. The initial verification script incorrectly
expected HTTP 204 from the deletion API; after correcting it to the existing
200 JSON contract, the complete workflow ran on a fresh copy. This verifies the
sequential deletion/refresh boundary, not every concurrent deletion race or
upstream URL expiration behavior.

## Atomic query usage persistence

Validated customer media usage now commits with query evidence, task status and
encrypted result references, before completion marking or settlement. The query
path and standalone trusted-usage entry point share the same validation and
insertion implementation. A process interruption can no longer commit a valid
query's success observation while leaving its corresponding usage insertion for
a later, separate transaction. No new schema or public API fields are required.

Usage validation runs in a savepoint. Invalid usage, invalid pricing or a
conflicting usage record rolls back that savepoint, retains the raw diagnostic
observation and returns the existing error without settlement. Database failures
roll back the whole query-observation transaction. Unknown usage stays unknown;
personal owner-funded requests do not acquire customer pricing or usage entries.
The nonempty priced-usage success, validation-rejection and storage-failure
branches require actual paid-media verification and remain unverified.

On the rebuilt native Gateway, a fresh stopped-database copy of the actual
owner-funded video repeated download, deletion, real upstream refresh and
process replacement. Both deleted references remained unavailable without
restoring ciphertext or changing financial counts. Independent reopening and
HTTP artifact comparison confirmed the same result. This exercises the unpriced
query branch only. Original native runtime replacement also preserved existing
configuration, encrypted identity and durable counts; saved video billing reads
and access checks were repeated. Compilation/static checks completed separately.

## Recovered video in customer request reports

A fresh copy of the actual completion-recovery video's stopped database was
opened with the current native Gateway. Workspace-viewer request list, detail
and CSV export agreed with the installation read: `confirmed_completed`,
`owner_funded`, null customer currency/amount in JSON and empty charge fields in
CSV. The list identified the request as video. A foreign organization viewer
received 404 for detail/export, and the workspace viewer received 403 from the
procurement cost endpoint. Customer serialization contained no Supplier cost,
credential or route configuration fields.

After process replacement, the CSV was byte-identical and detail unchanged.
Attempt, transport-observation and financial-entry counts stayed constant. An
independent process reopened the stopped database and matched the saved JSON/CSV
to the completed attempt, its personal funding binding and absent customer
charge. These reads made no upstream request and did not alter the original
installation or the retained source database. This verifies customer reporting
for the recovered owner-funded job; it does not qualify paid-media reporting or
browser presentation.


## Reconciled text invoice checkpoint

Invoice-detail reads now require an existing invoice in the authorized workspace.
Unknown and out-of-scope invoice identifiers return 404; empty text/media arrays
only describe an existing invoice without that kind of charge. The response
explicitly sets `Cache-Control: no-store`. Before the correction, an actual request
for a nonexistent invoice returned 200 with empty details.

An isolated copy of an actual native Messages completion exercised invoicing after
supplemental usage reconciliation. Eight simultaneous issuance calls produced one
invoice and one entry. Its token counts, immutable tariff revision and exact amount
matched the original native response and customer charge, even though a newer
customer tariff had been published. Replay and restart retained the same invoice.
There remained exactly one inference attempt, customer charge and balance debit.

The invoice reported paid from its existing credit-backed debit, without creating
an external invoice-payment or funding record. Billing showed no invoice amount
due and no unbilled charge, while the company balance retained the negative amount
owed under approved credit. Workspace viewers could read but not issue invoices;
sibling-workspace and foreign-company reads were refused. Independent reopening
checked the invoice entry, original usage, bound price and ledger amounts.

A separate actual unknown-usage completion still rejected issuance with
`reconciliation_required`, retained its open reservation through restart, and had
no invoice, charge or debit. These observations do not qualify positive customer
media invoices, historical media supplements or external commercial settlement.

## Personal video alongside credit-backed text

A current-input run on pinned backend revision `e655a37` reopened an isolated copy
of a stopped database containing an actual completed personal video. In the same
workspace, a new real text completion used explicit customer token prices and
approved internal credit. Issuing an invoice across both requests produced one
text entry with the exact token-based charge and no media lines. The video billing
response remained `owner_funded`, with null customer currency, charge and usage.
It did not block text invoice issuance.

Idempotent issuance and Gateway restart preserved the invoice and video billing
response. A separate process rehashed the saved upstream text response and reopened
the stopped database: both attempts were completed; the text charge matched its
bound tariff and single balance debit; the video retained its personal-route
binding without customer media pricing or charges. No funding receipt or active
balance hold existed, temporary keys were revoked, and media job/transport counts
were unchanged. This run submitted one new text request, not another video.

This verifies coexistence of customer-priced text and personal video. It does not
qualify an invoice containing a positive customer media charge, media-overrun
recovery, or external commercial settlement. Those branches remain unverified;
external provider or merchant activation is not itself a backend-readiness gate.

## Closed-period issuance with a later real request

Pinned backend `e655a37` completed a real credit-backed text request in a fresh
isolated workspace, then closed its invoice interval at a database-clock boundary.
A second real request ran concurrently with issuing that first interval. It was
dispatched at or after the boundary and belonged to the next adjacent interval.
Each invoice contained only its own attempt and exact token-priced amount.
Idempotent replay after Gateway restart retained the same two invoice identities.

Independent reopening rehashed both original responses, recomputed their charges,
and checked dispatch times against the boundary, invoice attribution and each
balance debit. Exactly two attempts, two invoice entries and two debits existed;
the temporary key was revoked, no customer reservation remained open and no
funding receipt existed. This verifies ordinary closed-period text issuance while
new work continues, not a late media charge inside a historical issued interval.

Current issuance rejects overlapping periods and unresolved priced attempts in
its interval. Historical media supplements remain unimplemented, but they should
not be introduced merely to compensate for ordinary later dispatch: that work
belongs to its own period. A reproduced historical case and explicit adjustment
contract are needed before changing immutable issued invoices.

## Bounded invoice transaction contention

Issuance and idempotent replay now set transaction-local `lock_timeout=250ms` and
`statement_timeout=2s` before acquiring the workspace lock. These bounds cover
database waits, not pool acquisition or the entire HTTP request. A failed
transaction returns the existing sanitized storage-unavailable error; retries
must preserve the original period, currency and idempotency key. Timeout does
not establish whether an earlier independent transaction committed.

A current-input run on a stopped copy of real text invoice history reproduced
pre-change replay waiting beyond 1.6 seconds behind a held workspace row lock.
The changed binary returned HTTP 503 in approximately 259 ms while the lock
remained held, without changing invoice, entry, ledger or billing-audit records.
After releasing the lock, exact replay succeeded before and after restart.
A subsequent real model call completed and charged exactly once.

Independent reopening checked the PostgreSQL lock-timeout diagnostic, unchanged
invoice/audit counts, retained raw response hash and usage, exact subsequent debit,
revoked temporary keys and no open customer hold. The original runtime/database
were untouched by the isolated run. Release compilation and storage formatting
checks completed separately. This verifies the row-lock timeout and subsequent
business path; arbitrary long statements and every commit-acknowledgment failure
remain outside this checkpoint.

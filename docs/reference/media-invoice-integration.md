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

Actual positive text/media invoices, mixed invoices, pending media-overrun
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

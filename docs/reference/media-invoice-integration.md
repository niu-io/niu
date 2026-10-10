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

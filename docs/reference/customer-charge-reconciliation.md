# Customer charge reconciliation

`GET /admin/v1/organizations/{organization}/billing/charge-reconciliation`
returns a read-only comparison of customer charge records and prepaid balance
charge entries. The JavaScript SDK exposes `getCustomerChargeReconciliation`.
Organization-wide owners/admins and installation administrators can read it.
Workspace-only credentials, organization viewers and other companies cannot.

The query uses one database statement snapshot and returns one row per configured
currency. Amounts and counts are exact decimal strings. `observed_at` identifies
the observation; no account, request or Supplier identifiers/prices are returned.
Only attempts pinned to prepaid balance accounts participate. Historical invoices
without such a binding are a separate accounting system.

| Field | Meaning |
| --- | --- |
| `charge_records` | Distinct prepaid-bound attempts with a text or media charge |
| `completed_unaccrued_attempts` | Completed prepaid-bound attempts without any text or media charge record; may await usage or financial recovery |
| `expected_charge_nanos` | Total original text/media customer charges |
| `posted_charge_nanos` | Total original balance charge debits, expressed positively |
| `missing_charge_entries` | Positive customer charges without a balance debit |
| `mismatched_charge_entries` | A charge record and debit exist but amounts differ |
| `unexpected_charge_entries` | A debit has no matching prepaid-bound charge record |
| `duplicate_charge_sources` | More than one customer charge source for an attempt |
| `settled_open_reservations` | A zero charge or exactly posted charge still has an open reservation |

Refunds do not change comparison against the original immutable charge. This
report does not recalculate tariffs, verify external payment settlement, reconcile
funding/refunds, diagnose missing usage, or repair records. The completed-unaccrued
count exposes a pending accounting state without assigning a monetary value.
It excludes in-flight and owner-funded attempts; a nonzero count is not evidence
of corruption or permission to repeat inference.
A media charge can precede its debit while settlement is pending. A discrepancy
is an observation to investigate, not proof of corruption; compare subsequent
observations and the underlying authorized records. Zero discrepancies on an
empty account do not establish a working paid business flow.

## Current-input verification

The optimized current gateway returned USD and CNY observations for a newly
created, unfunded company with zero credit. Both rows shared one observation
timestamp; independent PostgreSQL reads matched the accounts, empty prepaid
bindings and unchanged ledger. Exact zero fields and the complete response field
set were checked. A real organization-owner session read the report; organization
viewer, workspace-owner and foreign-company sessions were denied. All temporary
operator credentials were revoked. No funding, inference or synthetic charge was
created. Compilation, Clippy, SDK build and OpenAPI parsing completed.

### Nonempty charges and partial refund — 2026-10-10

A fresh native gateway/database run on the migration-227 binary made two actual
OpenRouter Chat calls, one streamed and one buffered. Each operation first had a
real authentication rejection, then completed through the bounded successor.
Explicit internal credit and test retail rates funded Niu accounting; this was
personal upstream testing, not qualified commercial supply or received cash.

The two completed attempts produced 26,420 nanounits of original customer charges.
The report counted exactly two charge records and matched their original debits;
all five discrepancy counts were zero. Independent SQL read both charge entries,
and a separate inspection recomputed each charge from saved provider token usage
and its pinned rate. Rejected predecessors and a later exhausted retry chain did
not add charge records.

An actual administrative partial refund of 4,444 nanounits was replayed with the
same idempotency key. SQL showed exactly one refund and a net ledger balance of
−21,976 nanounits. The balance API agreed and held reservations were zero. The
charge reconciliation fields remained identical apart from `observed_at`: they
correctly retained 26,420 as the gross original charge/debit totals. Restart
preserved the report, entry counts and net balance. Invoice issuance and replay
also retained exactly the two original successful charges.

This verifies a nonempty matching text ledger with an idempotent partial refund.
Missing/mismatched debits, duplicate sources, concurrent financial writes and
customer media reconciliation remain unverified. No discrepancy or funding receipt
was fabricated. Fixture outcomes provide no evidence for those cases.

### Debit-write failure and atomic recovery — 2026-10-11

A fresh native Gateway completed an actual strict-JSON OpenRouter request while
an isolated database trigger rejected insertion of customer charge debits. The
requested marker and reported usage were received. The completed attempt and
usage persisted, but the text charge and balance debit both remained absent:
they share one transaction, so the debit failure rolled back the charge too.
The original customer reservation remained held through Gateway restart.

Repeated read-only reconciliation returned zero charge records and zero
discrepancies without changing the held reservation or ledger. This is a concrete
example of the report's scope: zero discrepancies do not establish that every
completed request has finished financial recovery.

Removing the fault allowed background recovery to create the original charge
and matching debit and release the hold. A further restart retained exactly one
attempt and one debit. Independent reopening matched response token counts,
recalculated the charge from the pinned internal customer rates, checked currency
and workspace attribution, and confirmed the released reservation and revoked
temporary key. No second inference was submitted to recover the financial write.

The initial verifier expected a retained charge without a debit; actual execution
and source inspection contradicted that assumption. The corrected run verified
atomic rollback and recovery instead. It does not exercise mismatched debits,
duplicate charge sources, media reconciliation or external funding. The original
development database and encryption identity were unchanged.

### Completed but unaccrued visibility

The report now includes `completed_unaccrued_attempts` in the same statement
snapshot as the charge/debit comparison. The generated OpenAPI and JavaScript
SDK expose the field as an exact nonnegative decimal string. Existing discrepancy
counts retain their meanings; the new counter does not assign an estimated
charge or cause recovery writes.

A new actual OpenRouter completion with an injected debit-write failure was read
through the built SDK. The counter was `1` while the charge and debit were absent,
including after Gateway restart; the original reservation remained held. Removing
the fault allowed financial recovery to commit one charge/debit and release its
hold, and the counter became `0`. Independent database reopening matched reported
usage and exact tariff arithmetic, one attempt and one scoped debit, with no
duplicate execution or balance entry. This verifies the exercised text path;
missing-usage media and other discrepancy categories retain their own boundaries.

The existing native database was privately backed up before the runtime update.
Archive inventory readability was checked, not a restore of that new backup.
Configuration hashes, encrypted Supplier identities and durable business counts
were preserved. The retained integration company's actual settled charge remains
readable with a zero completed-unaccrued count. Migration 0240 was installed as
part of that update; this does not add nonempty inspected-image cleanup evidence.

### Nonzero pending-count authorization and currency isolation

A separate fresh current-input run repeated the real completion/debit-fault
workflow with USD and CNY accounts and a second company. While USD had one
completed unaccrued attempt, CNY and the other company remained at zero. Company
owner and admin sessions read the exact pending count with `Cache-Control:
no-store`; both currency rows shared one observation timestamp. Company viewers,
workspace owners and foreign-company owners received 404 without report fields.
An inference key received 401.

The same scope checks held after Gateway restart with the debit fault active,
and again after recovery changed the USD pending count to zero. All temporary
operator sessions were revoked and subsequently received 401. Independent
database reopening confirmed session revocation, the one original completion and
exact debit, and no open reservation or duplicate execution. No fixture outcome
was used. This verifies the exercised company/currency boundaries for text
recovery, not every media or financial-discrepancy state.

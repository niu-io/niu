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
| `expected_charge_nanos` | Total original text/media customer charges |
| `posted_charge_nanos` | Total original balance charge debits, expressed positively |
| `missing_charge_entries` | Positive customer charges without a balance debit |
| `mismatched_charge_entries` | A charge record and debit exist but amounts differ |
| `unexpected_charge_entries` | A debit has no matching prepaid-bound charge record |
| `duplicate_charge_sources` | More than one customer charge source for an attempt |
| `settled_open_reservations` | A zero charge or exactly posted charge still has an open reservation |

Refunds do not change comparison against the original immutable charge. This
report does not recalculate tariffs, verify external payment settlement, reconcile
funding/refunds, detect unknown usage before a charge exists, or repair records.
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

Nonempty correct ledgers, missing/mismatched debits, duplicate sources, refunds
and concurrent financial writes remain unverified with actual financial records.
Fixture outcomes provide no evidence for those cases.

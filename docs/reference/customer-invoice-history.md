# Complete customer invoice history

`GET /admin/v1/organizations/{organization}/projects/{project}/billing/invoices`
provides the full retained history beyond the billing overview's latest 100
invoices. Existing administrative workspace read authorization applies; foreign
workspaces are hidden. The endpoint is read-only and returns customer billing,
never Supplier purchase prices, credentials or procurement budgets.

## Integration contract

Use `limit` (1–100, default 50), `before` (the previous `next_cursor`), optional
`currency`, and optional `from_ms` / `to_ms`. Time bounds filter **invoice creation
time**, inclusive/exclusive respectively, in Unix milliseconds. They do not filter
the usage interval represented by each invoice's returned `from_ms` and `to_ms`.
Bounds must be nonnegative and at most 253402300799999, and the lower bound must
precede the upper bound. Currency is three uppercase letters; there is no FX.

The response is `{ "data": [...], "next_cursor": null | "..." }`. Each record
contains `id`, billed `from_ms` / `to_ms`, `currency`, exact decimal-string
`amount_nanos`, `created_at`, `status` (`issued` or `paid`) and nullable
`payment_reference`. Internal IDs are routing/cursor values, not display labels.
Responses use `Cache-Control: no-store`.

Records are ordered by creation time and ID, both descending. Keep filters fixed
while following the cursor. Missing, foreign or out-of-filter cursors return
409; inaccessible or absent workspaces return 404. Unknown query fields and
invalid bounds return 400. Newer inserts do not shift subsequent pages, but
separate HTTP requests are not a frozen snapshot. Restart from the first page
to discover new records. There is no total history cap.

The JavaScript SDK provides `listCustomerInvoices(scope, query)` and
`CustomerInvoicePage`. Shared `LedgerHistoryQuery` uses `before`, `currency`,
`fromMs`, `toMs` and `limit`; Supplier settlement history reuses the same bounded
filter validation while retaining its separate authorization and serialization.
Migration 0236 adds a workspace-leading ordering index. Cursor validation and
page/status reads use a single PostgreSQL statement snapshot.

## Settlement semantics

A matching posted customer balance debit settles the original invoice obligation,
including when that debit used approved credit. Account debt remains in the
balance ledger; it must not become a second invoice debt. A refund does not erase
the original debit or reopen the original invoice. Legacy confirmed invoice
payments also count as settlement. Reading or issuing an invoice does not fund
the company balance or collect external payment.

## Current-input verification — 2026-10-11

The retained isolated database from the
[two-gateway actual workload](two-gateway-text-load.md) contained 152 completed
requests and their exact charges/debits. Normal invoice issuance APIs generated
152 nonoverlapping statements from those actual charge sources. No new upstream
request, funding receipt or invoice payment was created.

A 17-row traversal began with 151 invoices. Issuing the last invoice between
page reads did not duplicate, omit or shift the original cursor set. A new
19-row traversal returned all 152, including the new record first, and totaled
**2,553,906 USD nanounits**. The overview still returned 100 previews with matching
fields/statuses, while its full-ledger paid total matched all 152 invoices and
its invoice debt remained zero.

Independent reopening joined each invoice to its source charge and original
balance debit: every amount agreed, all 152 source relationships were preserved,
and API ordering matched stored creation order. After gateway restart, a
23-row traversal returned identical records. A separate nonempty time window
returned exactly 21 invoices in seven-row pages with inclusive/exclusive bounds
matching independent timestamps; an out-of-window cursor returned 409.

Actual HTTP and SDK reads agreed. Scoped viewers could read their workspace but
not a foreign one; operator revocation denied the next read. Foreign cursors,
invalid filters and unknown query fields were rejected. Supplier history's
shared filter/authorization path was re-exercised separately against actual
API-created scopes; that check still has no nonempty Supplier payment evidence.

This qualifies the exercised internal-credit customer invoice history. It does
not qualify merchant funding, mixed-currency nonempty totals, every legacy or
media invoice, a frozen export snapshot or browser integration. No fixture result
supports these findings. The development database and encryption identity were
preserved.

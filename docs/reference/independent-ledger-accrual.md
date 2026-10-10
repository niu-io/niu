# Independent ledger accrual after completion

A completed request can have three distinct monetary records: Supplier earnings,
customer selling charges and configured procurement costs. Their prices and
required evidence are independent. A missing cached-input quantity for a Supplier
quote must not prevent a flat customer tariff with complete aggregate usage from
being considered for accrual.

Previously, completion processing returned immediately on a Supplier accrual
error, skipping the customer ledger and subsequent attempts in that batch. The
completion methods now persist execution/usage evidence first, then attempt both
ledgers for every completed attempt. Procurement cost settlement is attempted
independently after those accrual attempts. Evidence-persistence failures still
stop processing before any of these follow-up operations.

Each ledger retains its own transaction, pinned rate, validation and idempotency
rules. The first processing error is returned to the caller; successful work in
another ledger is not undone or falsely reported as resolving that error. Existing
recovery scans can retry missing entries. Unknown quantities remain unresolved,
and a customer hold is released only through the existing customer settlement
logic. This change neither equates Supplier payouts with route costs nor introduces
a distributed transaction across the ledgers.

## Verification boundary

Compilation and all-target gateway Clippy completed. Current-input validation of
the rebuilt gateway is recorded below. Missing-Supplier-category errors with real
customer charges, mixed paid batches, cost settlement during another ledger's
failure and restart/replay of these financial cases remain unverified. Fixture
outcomes are not evidence for these branches.

After restart, an actual owner-funded Chat SSE call and an actual nonstreaming
Responses call each completed through the gateway. Terminal/response usage totals
and cache/reasoning quantities matched independently read PostgreSQL records.
No customer ledger entries were created; the original credential identity was
preserved. Temporary keys were revoked and temporary models/credentials disabled.
These calls exercise the common completion path without commercial ledger entries;
they do not establish the financial error-isolation cases listed above.

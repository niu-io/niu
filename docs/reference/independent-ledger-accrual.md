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

## Media completion and recovery

The same separation applies to succeeded video query observations and recovery
from already recorded agreed media usage. After confirmed completion, Supplier
accrual and eligible customer media settlement are both attempted; a Supplier
error no longer skips the customer operation. The existing customer requirements
remain: a pinned selling card, a succeeded job and agreed reported quantity.
Supplier accrual retains its own usage and purchase-card validation. The first
error is returned so polling/recovery does not mark an unresolved operation as
fully settled. This does not issue a new generation request.

Real paid media error interleavings, independently successful customer settlement
during Supplier failure, and restart convergence for those cases remain
unverified. The personal video checkpoint below cannot establish them.

With the rebuilt gateway and original database identity, an actual refresh of a
previously generated owner-funded video succeeded. The downloaded result matched
the original artifact's SHA-256 and byte count and decoded fully with FFmpeg.
The scoped viewer read succeeded, a foreign viewer was denied, and revoking the
selected workspace key blocked subsequent access. Independent database counts
showed no additional submission timing record, customer balance entry or Supplier
earning for that job. Temporary viewer credentials and the key were revoked.
This verifies the exercised personal refresh/result path after restart, not the
paid media branches above. Gateway Clippy, release compilation and formatting
completed; fixture outcomes were not used as evidence.

## Transaction ownership for recovery

Customer text accrual, Supplier text/media accrual, procurement settlement and
nonexecuted customer reservation release now expose storage-internal transaction
helpers. Their existing public methods still own and commit one transaction per
operation. Supplier media detection and its accrual use the same connection.
The financial calculations, evidence checks and idempotency keys remain in these
shared helpers rather than being duplicated for a background worker.

A caller of a transaction helper owns rollback on error and must preserve the
independence of the ledgers. The financial worker now uses these helpers for
[coordinated recovery](financial-recovery-coordination.md); that document separates
implemented ownership from the remaining paid-backlog verification.

After release compilation and restart, a new actual owner-funded Chat stream
completed with reported token totals/categories matching PostgreSQL. A current
refresh and download of the existing personal video matched its original SHA-256
and byte count, decoded fully, permitted its scoped viewer and rejected a foreign
viewer and revoked key. No additional generation submission or financial entries
were created. Temporary access was revoked; the original credential identity was
preserved. All-target Clippy, formatting and public-tree checks also completed.
These personal-path observations do not verify paid ledger mutations or recovery
concurrency. Fixture outcomes were not used as evidence.

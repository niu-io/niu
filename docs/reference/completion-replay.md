# Completion replay and token-category preservation

Gateway completion fallback now calls the same storage path as batch completion,
with a one-record batch. It retains reported usage, provider model and optional
cache/reasoning observations. Previously the individual fallback called an older
interface without token categories, and an unpriced conflict could be reported as
successful persistence without checking the contradictory record.

The batch completion transaction accepts already-completed records only when
scope, usage confidence, aggregate token counts and normalized provider model
match the supplied evidence. Supplied known token categories must agree with existing known
values. Later evidence can fill unknown fields; a partial replay cannot erase
already known quantities. The merged input partition must remain within the
reported aggregate input. Categories can be supplemented without changing the
terminal attempt.
A conflicting category or completion rolls back the transaction. Exact replay
preserves the original completion timestamp. Completion replay does not resubmit
inference. Priced and unpriced fallback no longer treat an unverified conflict as
success; accounting recovery remains a separate durable process.

## Current-input verification

On the updated optimized gateway, a new temporary key made one actual personal
Chat request. Its returned aggregate/cache usage was matched to PostgreSQL. A
locally compiled storage caller then used that actual persisted completion to
replay sequentially and concurrently through completion/accrual. Contradictory
usage, provider model and cached-token observations were rejected. Independent
before/after comparison found the full attempt row, completion timestamp and
category row unchanged. There remained exactly one upstream dispatch and no
customer debit. The temporary key was revoked.

Storage/gateway Clippy, test-target compilation and release compilation completed.
No fixture outcome is evidence. This verifies replay of an actual completed
personal request, not an induced new-completion mixed-batch rollback or a new-completion/replay
race. Paid completed-record replay is covered by the later checkpoint below.
[Lost settlement commit acknowledgements](customer-ledger-idempotency.md) have
separate evidence and are not inferred from this replay run. Independent cache
pricing is not implemented by the completion-replay change.


## Priced completed-record replay — 2026-10-11

A current native gateway opened an isolated copy of the retained mixed-recovery
run: 114 actual completed model requests, 114 customer charges and 114 balance
debits. A storage caller built against the current source selected a completed,
priced request and supplied its persisted provider model, aggregate usage and
reported cache/reasoning categories to the actual completion/accrual entrypoint.
No inference was resubmitted and no funding receipt was introduced.

Sequential and concurrent single-record replay completed. A two-record batch
containing an exact replay and contradictory aggregate usage was rejected as a
conflict. Exact two-record batches completed, including two concurrent callers
using opposite record order. Separate conflicting model and cached-usage replay
were rejected. These records were already completed: this does not exercise a
new completion racing with replay or rollback of a newly completed batch member.

Full-table fingerprints for attempts, token categories, customer charges, balance
entries, customer reservations and upstream-cost reservations remained unchanged
through these calls and a gateway restart. An independent process reopened the
stopped database and compared all six fingerprints, then verified that every
customer charge had one exact debit with matching account, organization,
workspace, currency and amount. It found 114 attempts/charges/debits, no duplicate
debit and no open customer hold. This includes preservation of completion times,
original charge revisions and released-reservation records.

The caller source, executable digest, output and database artifacts were retained
privately. This is current replay of retained real completions, not a new upstream
request qualification, Supplier earning acceptance or complete mixed-batch
failure-recovery qualification. No fixture outcome supports it.

## Opposite-order category replay deadlock — 2026-10-11

A follow-up supplied the retained categories for **both** real requests in each
opposite-order batch. The earlier two-record replay supplied categories for only
one member and therefore did not exercise competing category-row lock order.
In an isolated database, a temporary trigger delayed each category update by
300 ms to overlap the two actual storage calls. Before the fix, PostgreSQL
reported a deadlock and one caller failed. Durable business records were unchanged.

Completion batching now sorts category writes by attempt ID before taking those
row locks. With the same delay and actual retained paid completions, both
opposite-order concurrent calls succeeded. Conflicting usage/model/categories
remained rejected. The delay trigger was removed before restart. Independent
reopening verified unchanged full-table fingerprints for all six business tables,
114 exact scoped charge/debit pairs, no duplicate debit and no open customer hold.
Formatting and gateway Clippy completed separately as structural checks.

This is an induced scheduling fault over real completed records, not simulated
upstream usage. It verifies the category-lock correction through the current
storage caller. It does not qualify concurrent first-completion lock ordering,
all possible storage deadlocks or deployment to the original running gateway.


## Supplementing unknown category fields — 2026-10-11

Completion batching and standalone category persistence now share one scoped,
transactional write. Previously, an existing partial category row rejected a
later observation that filled one of its null fields. The shared write keeps
known quantities, fills only unknown fields and rejects known-value conflicts.
It validates both the incoming observation and the combined cache-read/write
partition against the completed attempt's input total. Concurrent observations
serialize on the category row; batch writes retain their stable lock order.
Existing customer charges are not repriced by adding category evidence.

A current storage caller used an isolated copy of 114 retained real paid
completions. An isolated missing-field fault removed one saved cache-write value;
the independently retained pre-fault category record supplied its actual value
for recovery. Concurrent batch and standalone supplementation succeeded. A later
partial observation preserved the newly known value, while a contradictory
quantity and a foreign-company write were rejected. The fault did not alter the
original source database or invent an upstream category.

After recovery and gateway restart, independent reopening matched all original
attempt, category, customer-charge, balance-entry, customer-reservation and
upstream-reservation table fingerprints. All 114 charges still had one exact
scoped debit, with no open holds. Caller source and observations remain private.
Formatting and Clippy completed separately.

This verifies restoring retained known evidence through the current storage
entrypoints. It does not establish an upstream correction feed, a public manual
correction API, first settlement of a previously unpriced request, concurrent
complementary nonzero partitions, or deployment to the original running gateway.
Those paths still require their own current-input verification.

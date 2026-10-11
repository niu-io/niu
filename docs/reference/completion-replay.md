# Completion replay and token-category preservation

Gateway completion fallback now calls the same storage path as batch completion,
with a one-record batch. It retains reported usage, provider model and optional
cache/reasoning observations. Previously the individual fallback called an older
interface without token categories, and an unpriced conflict could be reported as
successful persistence without checking the contradictory record.

The batch completion transaction accepts already-completed records only when
scope, usage confidence, aggregate token counts and normalized provider model
match the supplied evidence. Supplied token categories must agree with existing
values; missing categories can be recorded without changing the terminal attempt.
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

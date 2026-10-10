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
personal request, not an induced mixed-batch rollback, a lost commit acknowledgement,
a new-completion/replay race or paid exactly-once settlement. Those paths remain
unverified. Independent cache pricing is not implemented by this change.

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
correction API, concurrent complementary nonzero partitions, or deployment to
the original running gateway. First settlement after an isolated missing-field
fault is covered by the subsequent checkpoint below. Other paths still require
their own current-input verification.


## First settlement after missing-category recovery — 2026-10-11

Two native gateways shared an isolated copy of a retained credit-backed account.
An explicit customer cache-write tariff required a known write quantity. A new
actual OpenRouter `openai/gpt-4.1-mini` request returned 16 input and 8 output
tokens, explicitly reporting zero cache-write, cache-read and reasoning tokens.
A temporary database trigger omitted only the persisted cache-write field.
The saved response remained intact; no category was fabricated or inferred.

While the field was unknown, the completed request had no customer charge and
retained its 1,537,284-nanounit reservation through a two-gateway restart. After
removing the trigger, a current storage caller supplied the saved response's
actual categories through concurrent completion-batch and standalone observation
writes. The request then accrued one 1,009,877-nanounit charge and matching debit,
and released its reservation. Repeating supplementation after another restart
left the complete ledger unchanged and did not submit inference again.

Independent reopening matched the response hash, aggregate usage, restored
categories and exact tariff arithmetic, including the request fee. Both the
pre-existing and new charge had one exact debit; the prior ledger fingerprint
was unchanged, no customer hold remained, no funding receipt was created and
the temporary trigger was absent. This is internal-credit accounting over a
personal self-funded upstream call, not cash receipt or commercial supply.

This verifies first settlement when a persisted category is missing but the
actual completion response retained its explicit zero value. It does not qualify
nonzero category supplementation, an upstream correction feed, public correction
administration, or all mixed-category concurrency cases.

## Nonzero complementary observations — 2026-10-11

A further current run copied the retained real cache-write/reasoning history into
an isolated database. Its original saved response reported 5,314 input tokens,
5,269 cache-write tokens, 47 output tokens and 35 reasoning tokens. Only the
persisted write/reasoning fields were temporarily removed; the source database
and original provider response were preserved.

Two concurrent callers supplied complementary observations: completion batching
supplied the actual write quantity without reasoning, while the standalone scoped
writer supplied actual reasoning without the write quantity. Both succeeded and
the combined row recovered the complete original evidence. A partial replay
preserved known values; a contradictory write quantity and foreign-company write
were rejected. After gateway restart, request detail returned the restored
categories and the unchanged 1,387,531-nanounit customer charge.

An independent process reopened PostgreSQL and compared all six full business
fingerprints. It also checked both original response hashes, recomputed their
category charges from the original rates, and matched category quantities and
pinned revision IDs to durable rows. Both historical charges and debits remained
unchanged, despite the account's current tariff having been replaced previously.

This extends supplementation evidence to nonzero complementary write/reasoning
observations on an already charged request. It does not establish concurrent
cache-read/write partition overflow rejection, first settlement of an originally
unknown nonzero category, or a provider correction feed. No fresh inference or
funding was submitted in this run.

## Rejecting an impossible supplemented partition — 2026-10-11

An isolated copy of the same real 5,314-input-token request retained its known
5,269 cache-write tokens while its cached-read field was temporarily made unknown.
Two concurrent callers then submitted a deliberately invalid observation: 5,314
cached-read tokens with no write field. The incoming read quantity fits the
aggregate by itself, but combining it with the saved write quantity exceeds the
aggregate. Neither observation was treated as provider evidence.

Both completion-batch and standalone storage entrypoints returned conflict. An
immediate category-row comparison found no mutation. Supplying the original
response's actual cached-read value afterward restored the complete record.
Following gateway restart, independent reopening matched all six business-table
fingerprints and both original response hashes, category quantities, charge
amounts and pinned tariff revisions. Historical debits remained unchanged.

This verifies rejection against an already known complementary input quantity,
including simultaneous invalid writes through both entrypoints. It does not
establish every ordering of two previously unknown complementary quantities or
an upstream correction feed. The original database was not altered, and no new
inference or funding was submitted.

### Follow-up after company authorization and media recovery changes

A fresh actual personal OpenRouter request repeated the missing-category recovery
scenario on the current native workspace build after the shared authorization and
media candidate-paging changes. The response contained its fresh request marker.
An isolated persistence fault kept cache-write usage unknown and the liability
held without a charge across two-gateway restart. Restoring only the actual saved
response categories produced one exact debit and released the hold; repeated
supplementation after restart did not change the ledger.

Independent reopening checked both the retained earlier response and this fresh
response against their original rates, exact debits, restored categories and
released reservations, and confirmed removal of the fault trigger. This is one
new upstream request plus retained history, not a new load run or qualification of
commercial media, merchant funding or every change in the shared workspace.

## Actual mixed completion batch fallback — 2026-10-12

Clean digest-verified implementation `69c161d` handled 32 concurrent actual
structured OpenRouter requests in fresh native PostgreSQL. Two configured aliases
used the explicit dated model. Every response returned its unique marker and
native usage. An isolated category-write trigger rejected one alias's sole
attempt and delayed writes briefly to expose the real completion queue. No
upstream response or usage quantity was fabricated.

Gateway diagnostics retained a failed 13-record priced completion batch and its
per-record fallback. PostgreSQL identified exactly the batch and single-row
fallback failures from the deliberate row fault, with no statement timeout.
The other 31 requests settled; the unresolved request retained its liability.
A delivered HTTP 200 is not proof that its accounting persisted.

After removing the fault, authenticated canonical generation metadata returned a
usage receipt. The first saved artifact still had 31 charges: receipt acceptance
was not yet customer settlement. A stopped copy restarted with the same binary
and recovered the remaining debit without another upstream inference. Final
state had 32 charges/debits and no held customer or procurement reservation.

Independent reopening hashed and parsed every original response, matched each
generation to its distinct attempt, recomputed all pinned-rate charges and
checked original account identity. Exactly **534,461 USD nanounits** matched the
ledger. There was one canonical usage receipt, removed fault trigger, revoked
temporary keys and no funding receipt or Supplier earning. The unresolved
cache-write quantity remained null; its pinned tariff had no independent
cache-write rate, so known aggregate usage sufficed for this exact charge. No
unknown category was converted to invented zero usage.

This qualifies this real mixed priced-completion fallback and subsequent customer
recovery. It does not qualify every batch size/failure ordering, category-priced
unknown recovery, media/Supplier financial batches or production capacity.
Original deployment data and encrypted identity were unchanged. No fixture
outcome is evidence.

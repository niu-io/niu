# Customer ledger idempotency

Automatic request debits and caller-supplied balance-reversal keys use separate
idempotency namespaces. A refund key cannot suppress a request's debit, even when
its UUID equals that request's attempt identity. Reversal retries still share
one non-charge namespace per balance account: the original entry, reversal kind
and exact amount must all match. Changed input returns 409. This contract records
internal ledger changes; it does not execute external refunds.

## Durable posting and recovery

Migration 264 replaces the account-wide key constraint with a partial unique
index for non-charge entries. The existing unique charge-per-attempt index
continues to prevent duplicate automatic debits. No historical ledger identity,
amount or idempotency key is rewritten.

Text accrual ignores only an existing charge for the same attempt, then checks
that the actual ledger posting matches the immutable customer charge's account,
organization, workspace, currency and amount. A database trigger also refuses to
release a completed request's reservation without a matching debit, except for
an explicitly zero-priced charge. The trigger applies to text and media charges;
confirmed nonexecution retains its existing release behavior.

Financial recovery now finds prepaid-bound text charges with missing debits or
unreleased reservations, as well as attempts that have no charge yet. It keeps
existing bounded, claimed traversal and per-attempt savepoints. Invoice-only
legacy charges without a prepaid account binding are not converted into prepaid
debits. A conflicting mismatched posting remains unresolved rather than being
treated as success or rewriting immutable history.

## Actual collision and upgrade verification — 2026-10-11

An isolated database contained a charge from a real self-funded OpenRouter model
completion. During a second actual completion, an explicit database lock paused
charge insertion. A normal management API refund of one nanounit against the
first debit used the second live attempt identity as its idempotency key. The
refund completed before the paused charge transaction resumed.

Before the fix, two immutable customer charges existed but only one ledger debit
had been posted; both reservations had been released. Independent reopening
matched both actual responses and exact pinned-rate charges, confirming the
missing second debit. The shared uniqueness constraint and broad conflict-ignore
behavior had silently skipped that debit.

Repeating the same actual workflow after the fix produced two exact debits and
one refund. Retrying the refund preserved its original identity even though a
charge now used the same UUID in its separate namespace. Independent inspection
recomputed both charges from saved upstream usage and pinned internal prices,
then matched the complete ledger and net balance.

A separate stopped copy of the pre-fix failure database was upgraded. Two native
gateways recovered exactly the missing debit, with no new model request. Every
prior ledger row and both charge rows remained unchanged. Same-key refund replay
succeeded; changed amount returned 409. Restart preserved all rows. Independent
reopening confirmed the single appended debit and exact balance; the customer
charge reconciliation report had no missing, mismatched, unexpected or duplicate
entries and no settled open reservation.

The run used approved internal verification credit, with no received funding or
commercial Supplier agreement. Paid media settlement and broad throughput are
outside this evidence. The original development database and encryption identity
were not replaced or migrated during these isolated checks.


The balance-refund lost-COMMIT-acknowledgement run was repeated under migration
264: its initial 503, eight concurrent same-key retries and restart retained one
refund and exact net balance, independently checked from the saved database.
A read-only inspection of the original development database found no prepaid text
charge missing its exact matching debit; it did not migrate or mutate that database.


## Omitted debit, retained allowance and later recovery — 2026-10-11

A further actual request ran with an isolated database trigger that returned no
row for charge-debit insertion. The real model returned the requested marker and
reported usage, but the posting check rejected the absent debit and rolled back
the new charge transaction. The attempt retained its known completion and its
positive customer reservation. Setting its key cap to that reservation made the
next request return 402 `key_spending_limit_exceeded` without another attempt.

Two gateways were restarted while the fault remained active. The charge was
still absent, the original hold remained, and the key's committed allowance
still equaled its cap. Removing the trigger let recovery post one exact
pinned-rate charge/debit and release the hold. Committed key spending then equaled
the actual charge; remaining allowance equaled the cap minus that charge.
Another restart preserved these values without a new generation.

Independent reopening matched both saved real responses (the original charge and
the new recovered request), their usage, pinned-rate arithmetic, ledger amounts,
the stored key policy and its computed committed spending. No injected trigger,
open customer hold, extra attempt or funding receipt remained.

## Explicit zero-price compatibility — 2026-10-11

A separate actual request used an explicitly published zero input/output tariff
and zero request fee, with a zero key spending cap. It completed with reported
usage and a durable zero customer charge. No balance debit or customer reservation
was created; zero-price admission intentionally skips reservation creation.
Restart and independent reopening confirmed pinned zero rates, zero committed
spending and unchanged prior positive ledger entries. This covers explicit zero
pricing, not missing pricing or the database trigger's zero-valued reservation
release branch. The verifier was corrected to use the actual tariff revision and
to check reservation absence rather than assume a zero-valued reservation row.


## Native runtime upgrade and restored-backup check — 2026-10-11

The native development gateway was refreshed from a clean detached checkout of
committed main (`bb09fb6`), with a retained binary hash. Uncommitted work from
other development sessions was not included in that binary.

Before replacement, a fresh native PostgreSQL archive was restored into a new
isolated database. Full-row fingerprints for organizations, workspaces, encrypted
Supplier credentials, ledger entries, video jobs and transport timings matched
the source. Independent reopening confirmed the restored records. A separate
copy was then upgraded from migration 262 to 264 using the committed binary;
all recorded fingerprints remained unchanged. Workspace pagination and stable
route resolution survived restart, and offline encryption inspection succeeded.

The original native service subsequently applied migrations 263 and 264 without
rewriting its configuration or encryption identity. Configuration hashes,
credential identities/ciphertext/revisions and organization, workspace, video-job
and financial-entry counts stayed unchanged. Actual post-upgrade API reads
confirmed workspace pagination/routing and a discrepancy-free selected-company
charge report. Offline encryption inspection against the upgraded original
database also completed. These checks cover this native upgrade and restored
backup; they do not establish container, full business or performance acceptance.

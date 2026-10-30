# Storage architecture review — 2026-10-30

Dated evidence for Bead `niu-32s.1`, under architecture review `niu-32s`.
The initial reviewed base was `282dd68`; its verification used that working tree
with the migration repair described below. The later release integration against
`47cffaa5` is recorded separately below under release task `niu-i83`.
Execution state remains in Beads.

## Finding and repair

The legacy-to-baseline schema upgrade had a concurrency gap. It detected legacy
receipts before acquiring the SQLx migration advisory lock, released that lock
after running the legacy migrations, converted the receipts in an independent
transaction, then reacquired the lock for the current migrations. Two application
instances could both choose the legacy path and convert the same receipts.

This was reproduced on an isolated PostgreSQL 17 database created by executing
all 382 embedded legacy migrations, producing valid versions 1 through 383
(version 174 has its established compatibility treatment). Two current-source
migration jobs queued behind an advisory lock. A short row lock on the version 1
receipt made the conversion overlap deterministic without changing migration SQL
or checksums. One job failed with SQLSTATE `23505` on `_sqlx_migrations_pkey`;
the other completed. An earlier run without the receipt-row scheduling barrier
allowed both jobs to complete, demonstrating that the defect depends on timing.

[`migration_compatibility.rs`](../../crates/storage/src/migration_compatibility.rs)
now holds one SQLx advisory lock on one connection across legacy detection,
legacy completion, receipt conversion and current migrations. Nested migrators
reuse that connection with their own locking disabled. The migration connection
is closed on drop, including error and cancellation paths, so a session carrying
an advisory lock cannot return to the application pool.

## Current-input execution evidence

These initial observations were actual database operations using the reviewed
working-tree migration implementation and independently inspected PostgreSQL
artifacts. No fixture-test outcome was used as evidence.

| Execution on 2026-10-30 | Observation |
| --- | --- |
| Controlled legacy upgrade before the repair | Both jobs observed waiting on the advisory lock; one exited with the duplicate version 1 receipt error. |
| Same controlled legacy upgrade after the repair | Both jobs observed waiting on the advisory lock; both completed. |
| Independent inspection of upgraded database | Exactly versions `1, 384, 385, 386, 387, 388, 389, 390`; all successful; every receipt checksum matches SHA-384 of the corresponding current SQL file. Credits account, reversal and spending-limit tables are present; no advisory locks remain. |
| Two concurrent production `niu-gateway --migrate-only` commands on an empty database | Both completed; subsequent `niu-gateway --check-schema` reported the embedded schema current. |
| Failed migration while retaining a one-connection application pool | Deliberately changed an isolated baseline receipt checksum; migration rejected it. The pool replaced the migration session and independent `pg_locks` inspection found no advisory locks. Restoring the original checksum allowed the next migration call to complete. |
| Cancelled migration while its conversion statement waited on a receipt row | The pool replaced the cancelled session. PostgreSQL retained its advisory lock until the blocked statement resumed; after the row blocker released, the session and lock disappeared and the next migration call completed. The interrupted conversion left the 382 original legacy receipts intact before retry. |

The driver built against `niu-storage`; the fresh-install run also used the
production gateway command. Rust formatting and whitespace checks for the
changed migration file completed. A temporary operational driver was removed
from the public tree after execution; this review records the inputs and final
artifacts, rather than introducing a fixture result as an acceptance gate.

## Release integration verification — 2026-10-30

Remote main `47cffaa5` already contained `c77d349`, which introduced a separate
compatibility advisory lock, bounded acquisition retries and embedded-baseline
validation. The release preserves that lock and validation. It acquires the
compatibility lock before the SQLx migration lock on the same pool connection,
then runs detection, upgrades and receipt conversion on that connection. This
order matches the deployed version's compatibility-before-SQLx order. Both
nested migrators have independent locking disabled; successful cleanup releases
the SQLx lock before the compatibility lock. The connection closes on drop,
preserving the pool's connection configuration while preventing a session with
remaining locks from returning to the pool.

The actual v0.2.29 native Gateway executable had SHA-256
`8d90ab8fe9338a7d394d1f5683133e56d28f053bd8c8f8642373a1df7213ddf3`.
It ran against a separate PostgreSQL 17 database copied from the earlier isolated
fresh-schema database. Independent PostgreSQL sessions inspected lock ownership,
wait state and complete migration receipts; a separate SHA-384 calculation used
each release SQL source file.

| Actual current-input operation | Independent observation |
| --- | --- |
| Native `--migrate-only` from the isolated schema through 390 | Added migration 391; all eight previous receipt rows remained unchanged. Final versions were exactly `1, 384, 385, 386, 387, 388, 389, 390, 391`, successful and matching every source checksum. |
| An independent session held the compatibility lock used by the deployed version while two new native migration commands started | Both commands remained active and their database sessions were observed retrying `pg_try_advisory_lock`. Receipts stayed unchanged while blocked. Releasing the lock allowed both commands to complete with exit code 0. |
| An independent session held the SQLx migration lock; a new native command started, followed by a second | `pg_locks` showed the first migration session holding the compatibility lock and waiting for the SQLx lock under the same backend PID. The second command was observed retrying the compatibility lock. Releasing the SQLx blocker allowed both commands to complete with exit code 0. |
| Final independent inspection and native `--check-schema` | All nine complete receipt rows matched the post-upgrade snapshot, no advisory locks remained in the database, and schema inspection completed with exit code 0. |

The blockers were real PostgreSQL sessions controlling execution interleaving;
the commands ran the release binary and production migration entrypoint. No
fixture-test result supplies evidence. This verifies the merged lock order and
current schema behavior, not an execution of an older binary or a repeated
legacy-to-baseline conversion on the final binary. The initial legacy-conversion
evidence above remains scoped to its recorded revision.

## Coverage and limits

Source review also covered the monetary posted-balance counter and reservation
capacity calculation; Credits range allocation, restoration and purchase
reversal; workspace/key spending and concurrency policy reads/writes; and bounded
foreground/background transactions. No additional financial corruption was
confirmed in that inspection. Those observations do not establish billing
correctness under real payment, inference or large-volume concurrent traffic.

The repair does not make cancellation an immediate PostgreSQL query-cancellation
operation. Closing a client connection can leave an already executing server
statement active until PostgreSQL finishes or interrupts it. The cancellation
experiment explicitly observed this delay. No arbitrary global migration timeout
was introduced, and no claim is made about an indefinitely blocked database
statement or a network partition.

Hosted distribution inspection established that the current deployment runs
migrations during Gateway startup; it does not configure a separate migration
job. Its database already has migration 391, so this release does not require a
legacy receipt conversion there. The retained compatibility lock coordinates
with versions that already use that lock. Binaries predating that protocol can
still make a legacy decision before acquiring the SQLx lock and must not be
assumed safe participants in a concurrent legacy conversion.

These local runs did not modify a production database, exercise a production
upgrade, or establish full application release readiness. Production deployment
and hosted checks belong to the separate release evidence.

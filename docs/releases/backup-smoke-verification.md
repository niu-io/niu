# Backup smoke comparison checkpoint

Reviewed 2026-10-06. F01 and F10 remain incomplete.

The package smoke test now stops the application before backup, compares deterministic row counts and content fingerprints for every public table, plus public sequence definitions and allocation state, in the source and restored databases, then promotes the verified restored database, restarts the application and rechecks saved resources and prepaid reconciliation. This applies to both direct-image and Compose smoke runs. Database records and fingerprints remain in memory; credential-bearing rows are not printed. A surviving organization alone no longer passes restoration. Sequence comparison includes the last value and whether it has already been allocated; unused sequences remain distinguishable from used sequences. The record comparison does not check grants or external encryption-secret restoration. Application checks against the promoted restore are implemented separately below and remain unqualified without a container run.

All 20 packaging-script tests passed. New cases reject changed/missing restored records despite a surviving organization and verify application restart after a backup failure. A separate native PostgreSQL fixture performed a real dump and restore of organization and synthetic confidential-record tables, including Unicode and null values. The comparison passed for the unchanged restore and detected an altered record with the same row count. A follow-up real dump/restore fixture preserved used and unused sequence states, detected a reset sequence without changed rows, and passed again after restoring its original allocation state. All 20 packaging-script tests passed after the sequence extension. The isolated database was stopped afterward. No development database or Supplier credential was changed.

The deployment guide now describes the upgrade script's actual migration-version discovery, DDL failure injection and handling of migration-number gaps. Same-schema replacement is explicitly distinguished from migration-failure recovery.

Docker and Podman remain unavailable in the reviewed environment. No candidate image was built or run, and no packaged-server acceptance is claimed. Full fresh install, container restart, restored-application use, encrypted Supplier recovery and pinned previous-to-candidate upgrade still require qualification.

## Restored database promotion

After comparing all public table records and sequence state, the smoke now atomically renames its source database to `niu_backup_source` and promotes the verified restore to the application’s `niu` database. The application remains stopped during promotion; its existing finally block restarts it, so subsequent saved-key, inference and prepaid reconciliation assertions exercise restored records rather than the original database. The synthetic source is retained until container cleanup. A unit test verifies promotion is reached only after comparison; existing mismatch and restart-on-failure tests remain in place. All 51 script tests passed. A fresh isolated native PostgreSQL check executed the same transactional database renames and verified both promoted and preserved databases exist. Actual image startup against the promoted restore remains unqualified until a container runtime is available; this is not an F01 pass.


## Current release recheck — 2026-10-07

The current packaging-script suite passed 24 tests; migration-history checks passed
four tests. Docker and Podman are still absent, so no image/container result is
claimed. Inspection of the smoke script confirms text/prepaid restoration coverage
but no submitted video lifecycle fixture. Packaged video acceptance must add a
saved scoped job, original-route/encrypted-result recovery, pinned historical
customer charge reproduction and no repeated generation/debit across restore and
restart. Native video fixtures and table fingerprint equality cannot substitute
for this packaged workflow. F01/F10 and V17 remain open.


## Customer debit reconciliation boundary

The package smoke's paid-attempt check now joins the customer activity charge
projection, covering posted text and video charges, to one exact ledger debit.
Organization, workspace, currency and charge kind must match; amount alone is
insufficient. A local SQLite SQL fixture executes the actual generated join and
rejects each identity/currency/kind mismatch while accepting a matching debit.
All 25 packaging-script tests and public-boundary/scoped whitespace checks passed.
This verifies assertion behavior only. The complete packaged video lifecycle and
actual PostgreSQL container run remain required; no release gate is closed.


### Reconciliation reference validation

The smoke helper normalizes organization/attempt UUIDs before SQL interpolation
and rejects duplicate expected attempts before API or database access. Regression
cases prove malformed references and duplicates trigger no I/O. All 26 current
packaging-script tests and scoped whitespace/public-boundary checks passed. This
hardens the verifier; packaged video and container acceptance remain open.


### Accounting response completeness

Package account initialization/reconciliation now requires successful balance and
transaction responses. Reconciliation rejects continuation markers rather than
summing incomplete history, and requires one fixture account. Regression cases
reject failed responses and partial history before SQL debit checks. All 27
packaging-script tests and scoped whitespace/public-boundary checks passed.
This strengthens fixture acceptance, not complete packaged video qualification.


### Fixture currency reconciliation

Funding verification now requires the returned account's configured USD currency;
reconciliation requires every ledger entry to match that fixture account currency
before summing amounts. A regression rejects a CNY debit even when the numerical
USD balance would otherwise match. All 28 packaging-script tests and scoped
whitespace/public-boundary checks passed. USD is the existing isolated smoke
fixture currency, not a product default or a conversion policy.


## Combined release-script regression — 2026-10-07

`python3 -m unittest discover -s scripts/tests` passed all 68 tests after the
accounting changes. Coverage includes package command/error handling, prepaid
assertions, upgrade receipt preservation, migration history, public boundaries,
development launch behavior, import tooling, Supplier offer seeding and Guardrail
benchmark tooling. This is script-level evidence only. No container or live video
qualification follows from the suite. Public-boundary and scoped whitespace
checks also passed; the next package milestone remains the saved video lifecycle
through restored application startup and restart without repeated dispatch/debit.

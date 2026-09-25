# Niu durable storage

PostgreSQL is the authority for tenant ownership and attempt intent. Embedded, checksummed SQLx migrations create organizations, projects, operations and attempts. Composite foreign keys prevent an operation or attempt from being attached to another tenant's project. Every lookup and transition takes an explicit organization/project scope; callers must derive that scope from authenticated identity, not request-body claims.

An attempt is persisted before dispatch. Its atomic `not_sent` to `may_have_executed` transition must commit before the caller sends upstream bytes. Only the winner of that transition may send. A database error or ambiguous commit response must stop dispatch; recovery cannot infer that an uncertain attempt is free or safe to repeat. Completion records usage independently of settlement. Unknown usage is stored as NULL and requires reconciliation; explicitly reported zero remains distinct.

The gateway uses this store for authentication, bootstrap key administration, dispatch intent and non-streaming completion evidence. Reservations, immutable usage events, settlement and recovery workers remain required work. The current storage API deliberately has no method that marks a financial liability settled.

## Verification

Use a disposable PostgreSQL server with a role allowed to create databases:

```sh
DATABASE_URL=postgres://niu_test:niu_test@localhost/niu_test \
  cargo test --locked -p niu-storage --test postgres -- --ignored
```

SQLx creates an isolated database for each test. The integration test verifies tenant boundaries, competing dispatch transitions, committed evidence from an independent connection, unknown versus zero usage, overflow rejection and repeat migration application. It does not yet simulate a PostgreSQL crash or prove financial recovery. The storage CI job runs this test explicitly; a normal workspace test run leaves it ignored when PostgreSQL is unavailable.

Applied migrations are append-only. Add a new migration rather than editing a migration already deployed. The build script tracks the migration directory so new embedded migrations trigger recompilation, following the [SQLx migration guidance](https://docs.rs/sqlx/0.8.6/sqlx/macro.migrate.html).

## Persistent API keys

Keys belong to one organization/project and an explicit model allowlist. Issuance generates a random secret and stores only its SHA-256 hash. The secret is returned once and has no debug or serialization implementation. Expiry is required; the current maximum lifetime is one year. Wildcard model grants are not supported.

Authentication constructs a principal with private identity fields. Dispatch requires that principal and rechecks key status, expiry and the operation's model inside the dispatch transaction. A shared key-row lock serializes admission with revocation; revocation prevents later admissions but does not cancel work already admitted. Administrative callers must authorize their tenant scope before issuing or revoking keys. Storage methods do not implement operator role checks.

The PostgreSQL tests also cover stale principals after revocation and expiry, denial of an ungranted model, hash-only storage and idempotent revocation. Rotation and tenant operator roles remain pending; installation-wide bootstrap endpoints are implemented.

## Initial cost-control implementation

Immutable price revisions and settled cost entries use integer currency nanounits. Text-token rates are expressed per million tokens; the combined exact charge is rounded upward once. API-equivalent value and cash liability have separate rates and entries. Token counts are usage evidence, **not observed subscription capacity**. This initial schedule does not model cache categories, tool fees, fixed subscription fees or quota windows.

A project can enable a lifetime cash budget. Every later dispatch then requires a held reservation. Reservation and settlement transactions lock the attempt and update the shared budget atomically; duplicate settlement returns the original immutable entry. Unknown usage retains its reservation. An unsent reservation may be released; elapsed time or a failed response cannot release a dispatched attempt. Creating a budget does not reserve earlier admissions retroactively.

Trusted admission policy must supply a defensible token upper bound. If actual provider usage exceeds it, settlement records the full liability and a bound-exceeded flag, and exhausted budgets reject later reservations. This cannot promise a strict provider spending ceiling without verified upstream limits. Integer overflow fails the transaction without discarding existing exposure.

The gateway currently enforces the presence of reservations for budgeted projects but does not yet configure pricing, obtain trusted bounds or create reservations automatically. Budgeted inference therefore remains blocked until that integration is implemented. Organization/key budget hierarchies, ledger correction events, late evidence reconciliation, subscription cash allocations and observed capacity accounting remain required work.

## Completion settlement and recovery

`complete_and_settle` first persists execution and usage evidence, then settles attempts with an existing held price reservation and provider-reported usage. Settlement failures leave the completion evidence durable for retry. Missing usage retains its hold; absent pricing does not become a zero charge.

The gateway runs a recovery sweep every five seconds, processing at most 100 eligible rows per pass. The UUID cursor advances past failed rows and resets after a sweep, so one failed settlement does not block every later record. Multiple workers are safe because settlement is transactional and idempotent. The worker does not redispatch inference, infer usage, or release uncertain liabilities. Failure counts are logged without credentials or payloads.

Tests simulate the completion/settlement crash boundary by persisting completion, constructing another store handle, and running concurrent recovery passes. This is not yet a full process-kill or database-crash qualification.

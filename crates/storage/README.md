# Niu durable storage

PostgreSQL is the authority for tenant ownership and attempt intent. Embedded, checksummed SQLx migrations create organizations, projects, operations and attempts. Composite foreign keys prevent an operation or attempt from being attached to another tenant's project. Every lookup and transition takes an explicit organization/project scope; callers must derive that scope from authenticated identity, not request-body claims.

An attempt is persisted before dispatch. Its atomic `not_sent` to `may_have_executed` transition must commit before the caller sends upstream bytes. Only the winner of that transition may send. A database error or ambiguous commit response must stop dispatch; recovery cannot infer that an uncertain attempt is free or safe to repeat. Completion records usage independently of settlement. Unknown usage is stored as NULL and requires reconciliation; explicitly reported zero remains distinct.

The gateway uses this store for authentication, workspace key administration, dispatch intent, durable usage, reservations, settlement and recovery. Customer balances and charges are separate from Supplier expenses and earnings. Shared account reservations bound spending before paid dispatch; uncertain liabilities remain reserved. Funding requires a trusted, independently verified settlement source. These implementations still require full packaged and live commercial qualification.

## Verification

Use a disposable PostgreSQL server with a role allowed to create databases:

```sh
DATABASE_URL=postgres://niu_test:niu_test@localhost/niu_test \
  cargo test --locked -p niu-storage --test postgres -- --ignored
```

SQLx creates an isolated database for each test. The integration test verifies tenant boundaries, competing dispatch transitions, committed evidence from an independent connection, unknown versus zero usage, overflow rejection and repeat migration application. It does not yet simulate a PostgreSQL crash or prove financial recovery. The storage CI job runs this test explicitly; a normal workspace test run leaves it ignored when PostgreSQL is unavailable.

Applied migrations are append-only. Add a new migration rather than editing a migration already deployed. The build script tracks the migration directory so new embedded migrations trigger recompilation, following the [SQLx migration guidance](https://docs.rs/sqlx/0.8.6/sqlx/macro.migrate.html).

## Persistent API keys

Keys are scoped to one workspace (stored as an organization/project pair). Workspace-created API keys can call every model route available in that workspace; adapter-managed keys can retain an explicit model grant. Issuance generates a random secret and stores only its SHA-256 hash. The secret is returned once and has no debug or serialization implementation. Expiry is required; the current maximum lifetime is one year.

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


## Payment top-up intent

Top-up intent binds an existing company/currency account, exact amount, merchant, aggregator and payment method. A company-scoped idempotency key cannot be reused for changed intent. Immutable provider identity prevents reassignment or reuse across orders. Pending intent grants no spending capacity.

After independent payment verification, the trusted settlement method commits the funding entry, globally unique payment receipt and immutable order settlement together. Concurrent replay returns the original entry; any failed step rolls the entire transaction back. Callers must authenticate the integration and validate provider evidence before invoking it. Customer API serialization must exclude merchant integration metadata and internal identifiers. No checkout or payment callback HTTP integration is implemented by these storage methods.

## Customer media pricing bindings

`bind_customer_media_pricing` persists a versioned, customer-only pricing snapshot
before attempt egress. It checks workspace ownership, model and offer identity,
and company scope. Identical retries are idempotent; repricing and binding after
dispatch fail. Immutable database records and a serialized attempt lock prevent
competing text/media tariff bindings, including direct competing inserts.

`customer_media_pricing` retrieves only within the supplied workspace scope and
revalidates the exact snapshot codec. These internal documents are not ordinary
customer request API responses. Callers must authorize publication from customer
selling schedules; Supplier purchase terms never belong in these records.

This foundation does not publish active media rate cards or submit video jobs.
Those integrations remain required.

`record_customer_media_usage` records Provider-reported quantities from an
already-verified query or callback after egress. Estimates and mismatched units
are rejected. Immutable receipts deduplicate identical observations; conflicting
quantities remain stored rather than replacing history. Recording is bounded to
16 distinct receipts per attempt, with identical retries still accepted.

`customer_media_usage_state` returns scoped Unknown, Agreed, Conflicting or
Unpriceable evidence. An agreed amount uses the pinned customer tariff; it is
not a settled debit. Overflow does not discard reported usage or make it free.
The methods do not authenticate callbacks or implement video create/query APIs.

`reserve_customer_media_balance` prices a trusted adapter's qualified maximum
quantity with the pinned customer tariff, binds the company/currency account and
reserves shared capacity atomically. The bound and its qualification revision are
immutable; changing either on retry fails. No currency conversion occurs. Ledger
conversion preserves configured precision through nine decimal places; finer or
zero-valued reservations are currently rejected. Failed admission rolls back the
account binding and bound. Dispatched uncertainty retains the reservation.

A point estimate is not an upper bound. The caller must verify the model/channel
bound and its qualification evidence before invoking this internal method. There
is no automatic video dispatch or guaranteed Provider bound qualification here.
Personal owner-funded routes and customer media pricing are mutually exclusive
in both insertion orders and under concurrent writes.

`settle_customer_media_charge` requires explicit successful execution and one
agreed reported quantity. The transaction locks the company account and attempt,
calculates the pinned customer price, records the immutable explanation, posts
one exact ledger debit and releases the reservation. Duplicate callers return
the existing charge. A verified zero actual records zero without a zero ledger
entry. Unknown, conflicting or unpriceable usage leaves the hold intact.

Usage exceeding a qualified bound records the full charge with `bound_exceeded`,
rather than hiding the liability. If funds and approved credit cannot cover it
while protecting other holds, the charge remains unposted and its reservation
stays held. Funding or approved credit can resume settlement. Default zero credit
cannot become an overdraft; the database also guards debit capacity and release
of unposted media liabilities. Late contradictory observations are retained
for reconciliation and cannot reprice or debit the original settlement again.
Failure/cancellation/refund policies, correction workflows and live video adapter
qualification remain required. The shared ledger validates each charge against
its exact text or media source; Supplier expenses never serve as customer charges.

## Internal video job evidence

`bind_media_job` records an immutable upstream reference and schema revision for a dispatched attempt. `record_media_job_status` deduplicates normalized query evidence; `media_job_status` returns scoped progress, unknown or conflicting terminal results. These methods have no public job API and do not submit, settle or refund generation. The status set preserves evidence categories, not a full timed event trace. `pin_media_recovery_route` now preserves the pre-dispatch credential/model configuration. `media_recovery_route` rejects stale or disabled configurations and returns a non-serializable internal context. Database job claims prevent duplicate references within the same credential configuration. Authenticated adapters, dispatch-time revalidation, qualified rotation and polling workers remain required before endpoint integration.

`confirm_media_job_completion` confirms a bound job only from unopposed success observations. Database completion guards also cover generic attempt completion. Status writes serialize on the attempt lock, and media settlement rechecks bound-job evidence before posting a new debit. Success, reported usage and settlement remain separate; conflicting jobs retain holds. Already posted charges remain immutable when late contradictory evidence arrives and require explicit reconciliation rather than automatic repricing or refunds.

### Customer video selling schedules

`register_customer_media_rate` appends immutable customer-specific media rate
cards. A card ties its selling tariff, discount rules and explicitly qualified
maximum quantity to exact credential, model and video-schema revisions. Personal
owner-funded credentials cannot supply these cards. `select_customer_media_rate`
requires one effective match for customer and billing dimensions; missing,
ambiguous, disabled or stale configurations never fall back to procurement rates.
The selected calculation snapshot and liability bound can then be bound and
reserved before dispatch using the existing media accounting methods.

This is an internal storage mechanism. Callers must authorize configuration,
qualify the commercial offer and liability contract, derive billing dimensions
from validated effective request controls, and recheck route identity at dispatch.
Registration alone does not qualify a Supplier or enable customer-funded video.

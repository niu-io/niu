# Releasing Niu

Niu releases must preserve service availability and durable customer data.
These requirements govern product implementation and hosted release qualification.
Deployment-specific service identities, credentials and commands belong in the
hosting distribution repository, not this public repository. Execution state and
acceptance evidence live in Beads; this document is a durable release contract.

## Staging and production

Maintain persistent **staging** and **production** environments. Staging has its
own databases, credentials, encryption/signing keys, origins and test accounts.
Never point staging at production databases or copy customer data or production
secrets into it. Use bounded synthetic data and separately authorized upstream
access. Disable real merchant settlement and unsolicited external delivery in
staging; qualify simulated behavior explicitly as simulated.

Staging is a test environment, not a second writable production database or an
immediately interchangeable production instance. Promote the qualified immutable
application artifact and configuration contract into production. Never promote
staging data, keys, sessions or test billing records.

Record exact core, website and distribution revisions, image digests, migration
versions and qualification timestamps. Build once and promote the same image
where supported. If environment-specific composition requires rebuilding, record
the different digest and requalify that artifact; source equality alone is not
artifact equality. Production secrets remain runtime configuration.

## Availability during replacement

Use readiness-gated rolling replacement or a verified blue/green mechanism within
production. Keep the current instance serving until its replacement is ready.
Readiness must cover required database and module dependencies; process liveness
alone is insufficient. Failed builds or failed readiness must leave the current
version serving. Serialize production promotions and disable unintended branch
push deployments.

On termination, stop admitting new work and drain accepted requests before
exiting. Forward termination signals through the container entrypoint and every
supervisor. Coordinate HTTP drain, background cleanup, supervisor grace and the
hosting platform's kill deadline, leaving room for storage flush and process
cleanup. Configure and document finite limits; increasing the platform deadline
alone does not override a shorter application or supervisor deadline.

Qualify both ordinary requests and long-running streaming responses across an
actual replacement. Verify terminal stream output and durable request/accounting
state, not just HTTP 200 or continued arrival of tokens. Do not silently replay
possibly billed requests to hide deployment failures. Work exceeding the supported
drain window needs a documented durable continuation/retrieval path or another
verified deployment mechanism. Do not claim unlimited stream preservation.

Retain the previous dashboard's immutable assets for existing tabs. Verify an
already authenticated tab loads previously unopened routes after deployment, and
verify a fresh session against the new version.

## Database and background compatibility

Use expand-and-contract migrations: introduce compatible structures first, migrate
and verify data, and remove old structures only after the rollback window closes.
During overlap, both old and new application versions must work against the
migrated schema. Check database locks and migration duration on representative
staging data. A successful startup migration is not evidence that concurrent old
instances remain compatible.

Use migration locking and database-backed claims, leases or equivalent fencing
for background work. Verify overlapping old/new instances cannot duplicate
settlement, recovery, event delivery or other consequential actions. Preserve
idempotency and uncertain-outcome recovery semantics. Do not solve duplicate
execution by temporarily disabling authoritative accounting or authorization.

Application rollback does not reverse schema changes or customer writes. Retain
backups and test restoration separately. Never automatically restore a stale
snapshot over live customer transactions. If the previous application cannot run
against the current schema, stop promotion until a compatible recovery plan is
verified.

## Qualification and promotion

Complete the current candidate's [release acceptance gate](docs/release-checklist.md).
Historical GREEN evidence and local fixtures do not qualify a new hosted
candidate. Verify relevant installation artifacts, authorization, configuration
readback, model-pool revision conflicts, execution evidence, localization and
recovery journeys in staging. State upstream, payment and test-data limits.

During the staging deployment, continuously probe public routing and readiness;
verify in-flight streams, old/new sessions and durable state. Exercise a failed
candidate and a rollback using retained artifacts. Record observed failures and
probe coverage; a finite successful test does not prove an absolute uptime SLA.

Promote only after required evidence passes. Observe production throughout
replacement and verify the actual live revision, readiness, public routes,
authentication, old-tab compatibility and data integrity afterward. Preserve the
previous successful image and its compatible runtime configuration for a prompt
rollback. Rollback must use retained verified artifacts rather than rebuilding a
mutable branch. Fixes require regression verification before another promotion.

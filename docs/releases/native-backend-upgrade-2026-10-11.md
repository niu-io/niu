# Native backend upgrade — 2026-10-11

A clean source archive of public commit `99919968c2d35c25412c4eaf865262bb6e7dab00`
was built with that full commit explicitly supplied as `NIU_CORE_GIT_COMMIT`.
The resulting native binary was retained with its SHA-256 separately from the
shared working tree. No uncommitted changes entered this artifact.

A fresh backup of the running development PostgreSQL database at migration 267
was restored into an isolated database. Full-row fingerprints matched the
original organizations, workspaces, encrypted vendor records, customer balance
entries, video jobs and media transport timings. The fixed binary upgraded a
stopped copy of that restored database to migration 272. Offline encryption
inspection succeeded without rotating any key or encrypted record.

Actual HTTP requests read workspace directory pagination, resolved a saved
workspace route and obtained the six-stage financial recovery diagnostics.
Workspace responses remained identical after Gateway restart. Independent
reopening of the upgraded PostgreSQL database confirmed migration 272, all six
business fingerprints and the absence of any encryption rotation operation.

The same binary then replaced the native development Gateway after graceful
shutdown. Its existing configuration, encryption identity and listener were
preserved. Readiness returned 200; encrypted vendor bytes and revisions,
configuration-file hashes and durable organization, workspace, video-job and
balance-entry counts were unchanged. The running financial recovery endpoint
returned HTTP 200 with six stages.

This qualifies this native 267-to-272 upgrade and these preservation checks.
It does not qualify container packaging, every historical migration path,
customer-funded video settlement, Supplier payouts or production capacity.
No fixture outcome was used as evidence. Backups and operational artifacts are
retained privately; no original database was replaced with a test database.

## Usage and hold diagnostics runtime refresh

The native service was subsequently refreshed to a clean build of
`5e014f9ac9e60b8bcde8dc0930d9a76f07465208`, including category-only usage
supplementation, bounded reconciliation record waits and the reservation
`missing_usage_categories` field. The full commit was embedded at build time;
uncommitted shared-worktree changes were excluded.

A fresh schema-272 backup was restored into isolated PostgreSQL and compared
against the original six business-table fingerprints. The new binary passed
encryption inspection and workspace/recovery API checks across restart. Independent
reopening preserved the same fingerprints and confirmed that no encryption
rotation operation existed. The schema remained at 272; this refresh introduced
no additional database migration.

Separately, that exact binary served a stopped copy containing an actual unresolved
cache-write hold. Current API reads, company authorization, later tariff clearing
and restart retained the correct missing-category diagnostic from the original
pinned tier. Independent response/database inspection confirmed unchanged original
attempt and hold records with no financial mutation. This populated check is
stronger than inferring field behavior from an empty directory.

After graceful native process replacement, readiness and the six-stage financial
recovery endpoint returned HTTP 200 on the existing listener. Configuration hashes,
encrypted credential bytes/revisions and durable organization, workspace,
video-job and financial-entry counts remained unchanged. This refresh does not
claim another actual upstream generation or extend media/payment qualification.

## Supplier configuration index upgrade

A clean source archive of `bdb716b5606aeb6638c174f56920d031e767a646`
was built with its full commit embedded and its binary retained separately.
A stopped copy of the previously verified schema-272 native backup was upgraded
to 273. Both Supplier configuration route indexes were present. Workspace
pagination, saved route resolution and all six financial-recovery diagnostics
remained accessible; workspace responses remained identical across restart.
Offline encryption inspection succeeded.

Independent reopening confirmed schema 273 and unchanged full-row fingerprints
for organizations, workspaces, encrypted vendor records, customer balance
entries, video jobs and media transport timings. No encryption rotation operation
was created. Observed process startup through readiness, including migration,
was 448.66 ms for this retained database; it is not a measurement of index-build
time alone or a large-production-database estimate. These ordinary transactional
indexes can block concurrent writes during construction; plan the upgrade window
for the actual route-table size.

This verification did not replace the original database or refresh the running
native service beyond its previously recorded `5e014f9` version. It qualifies
this isolated 272-to-273 upgrade and preservation scope, not media usage
aggregation or production query capacity.

## Configuration usage runtime integration

The native development service was subsequently refreshed to clean committed
`3232f967e8e36092eec236781a81a57285b696be`, including configuration usage and its
transaction-local database deadlines. A fresh backup of the original schema-272
database was restored and independently compared before the retained binary
upgraded an isolated stopped copy to 273. Reopening that upgraded copy again
preserved all six business-table fingerprints, both route indexes and encryption
identity; workspace reads survived restart.

After checking the retained binary hash, graceful process replacement upgraded
the original development service to schema 273 on its existing listener.
Configuration-file hashes, encrypted vendor bytes/revisions and durable
organization, workspace, video-job and financial-entry counts were unchanged.
Readiness, an existing Supplier's configuration-usage endpoint and the six-stage
financial-recovery endpoint returned HTTP 200. These final reads confirm runtime
integration and do not replace the populated isolated workflow evidence above.
No original database was replaced, key rotated or upstream generation initiated.

## Responses retry runtime integration

The native development service now runs a clean source-archive build of
`cf84a177c4d62ce0151e639c84572998fcf4efe9`, including shared bounded Chat and
Responses authentication failover. The retained binary hash was checked before
process replacement; uncommitted shared-worktree changes were excluded.

A fresh schema-273 backup was restored and its six business-table fingerprints
checked against the original database. The exact binary upgraded an isolated
stopped copy to 274. Workspace directory and saved-route reads survived restart,
offline encryption inspection succeeded, and all six financial-recovery stages
were accessible. Independent reopening confirmed schema 274, unchanged complete
business fingerprints and no encryption rotation operation.

After graceful replacement on the existing listener, the original database also
reached schema 274. Configuration hashes, encrypted vendor bytes/revisions and
durable organization, workspace, video-job and balance-entry counts were
unchanged. Actual readiness, workspace directory and six-stage financial-recovery
reads returned HTTP 200. No original database was replaced or encryption key
rotated. These checks establish native upgrade and runtime integration; they do
not claim a new upstream generation or broader failover qualification.

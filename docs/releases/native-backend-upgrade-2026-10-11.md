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

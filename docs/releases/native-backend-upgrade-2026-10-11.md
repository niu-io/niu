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

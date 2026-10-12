# Native schema 290 to 293 upgrade acceptance

An actual restored-data run and a subsequent read-only verification of the upgraded original runtime established preservation of existing product data across schema 290 to 293. This checkpoint did not call model, media, payment or human-verification services and did not rotate encryption keys.

The retained and active runtime was `ef29c2929ceba22bc590faa8787946dbb78b62b5`, binary SHA-256 `8982dda8bd5c09ed7132fec199f772120ef8ca1391bee85f6afb37aeecd3f267`. The copied run used the current original database backup and byte-identical original configuration, with isolated database/bind settings and upstream video polling disabled. The original runtime upgrade was performed separately under a protected backup, binary and configuration check.

## Actual preservation checks

Before starting the current binary, the copied run captured every existing public relation's column inventory and a full-row fingerprint projected onto those original columns. It repeated those reads after migration, restart and the retained binary's `--check-encryption`. An independent verifier reopened the stopped source and final database and recomputed the actual projections.

| Check | Actual result |
| --- | --- |
| Original public data inventory | 225 relations: 222 tables and 3 views; migration bookkeeping checked separately |
| Unchanged original field projections | 224 relations remained identical |
| Operational recovery progress | Six existing stages changed only `updated_at` and `last_step_at` |
| Recovery identity and work counts | Stage keys, attempt cursors, candidate counts and failure counts unchanged |
| Product data | Financial, configuration, encrypted identity, media, logs, Chat and API-key projections preserved |
| Previously applied migration records | Original schema-290 migration rows and checksums preserved |
| New transport diagnostic columns | NULL on historical rows; no guessed backfill |
| New Provider group, asset, operation and verification-session tables | Empty |
| Current binary encryption audit | Completed successfully using the actual retained configuration and key |

The recovery progress changes were measured and classified rather than excluded from the initial comparison. They are existing local worker timestamps; no customer debit, funding receipt, Supplier earning, identity, request or product record was changed by this checkpoint.

## Original runtime verification

After the protected original upgrade, an independent read-only verifier compared live original SQL with the captured original before/after projections. Every original product-data projection matched. The same six operational stages differed only in the two timestamp fields above. Schema 293, the original migration prefix, NULL historical diagnostics and empty new Provider tables were confirmed independently. The original four FastRouter mappings remained disabled at this checkpoint.

The active process, ready endpoint (HTTP 200) and installed binary hash matched the retained runtime. The original configuration, encrypted credential identities and durable counts were preserved by the protected refresh. The original encryption audit completed successfully. The restored copy and live database each retained their own pre-upgrade baseline; no backup model row was restored over newer live data to force a cross-snapshot comparison.

Copied services were stopped. The verifier made no original write, upstream call or encryption rotation. This is native upgrade and preservation evidence, not a performance qualification or acceptance of a newly created Provider business flow.

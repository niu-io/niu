# Original 0174 migration compatibility

Verified 2026-10-09. This is a source/runtime checkpoint, not a new qualified
container image or full release acceptance.

The first development version of migration 0174 contained encrypted group-read
results but no in-flight deletion tombstones. Later source appended tombstone
DDL to that same migration. SQLx correctly refused the original saved receipt,
preventing startup on an existing database.

Storage now recognizes the exact original SQL checksum using a preserved source
copy. For that receipt only, the migrator uses the original migration definition;
SQLx retains advisory locking, dirty checks and validation of all other receipts.
Unknown checksums still fail closed. No existing receipt is rewritten. Forward
migration 0188 adds tombstones for the original history and is harmless for the
later history, where they already exist.

Two disposable PostgreSQL tests passed: original-history upgrade preserves
records and all earlier receipts, installs tombstones and survives reconnect;
current-history reconnect preserves all receipts. An unknown checksum is rejected.
The development database was backed up privately before startup. Normal
`pnpm dev` then became ready on port 2566 with live-source hot reload. Browser
sign-in reached the populated workspace overview, and a read-only receipt check
confirmed original 0174 remained unchanged and 0188 was applied.

The migration-0187 container evidence remains valid only for its frozen source.
A new image and upgrade run must qualify 0188 before extending that checkpoint.

Storage all-target Clippy passed with warnings denied, formatting passed, and
public-boundary checks passed. A browser reload restored the authenticated
workspace overview without returning to Login. These are scoped recovery checks;
the complete customer workflow review continues separately.

The [0188 package checkpoint](package-qualification-2026-10-09.md) now passes
direct/Compose restart and restore, plus pinned 0187 → 0188 upgrade. Original
0174 receipt-history acceptance remains native/development only.

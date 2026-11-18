# ARM64 installer upgrade and recovery, 2026-11-18

Release case `niu-nrcn.10` tracks distribution acceptance. The installer from commit `d15111a0` ran against actual Linux ARM64 containers, PostgreSQL and a funded v0.2.26 database. The target gateway was built from `f3cb3725` and assigned a local version tag. The run exercised the installer through its upgrade and rollback commands.

The v0.2.26 service returned ready before the upgrade. The installer wrote a PostgreSQL dump, restored it into a temporary database, migrated the copy and verified encryption using the target gateway. It then started the target against the installation database. Container inspection confirmed the target image reference and the gateway returned ready.

On explicit rollback, v0.2.26 initially failed to initialize the migrated database. The installer restored its pre-upgrade dump and restarted v0.2.26. The readiness endpoint returned success. Independent SQL queries returned the original workspace identifier, name and organization, and every ledger entry identifier and amount. Their output matched the saved pre-upgrade query output byte for byte.

A separate run exercised automatic rollback after a real Compose container-name collision. That run used two local image references to the same gateway to isolate the startup failure. The original service returned ready and the workspace and ledger readback matched the pre-upgrade record.

These runs cover local ARM64 recovery. Final tagged assets, anonymous image retrieval and AMD64 installation require their own acceptance evidence.

# Single-container deployment

Status: the single-container build includes the Rust gateway and TypeScript dashboard, and versioned releases are published. Complete installation, upgrade and business-flow qualification remains open in the [first-release checklist](../releases/first-release.md). Implementation and release qualification are separate states.

## Default installation

The distribution uses one Niu application container with one public port for inference APIs, the management API, the TypeScript static dashboard, authentication and health endpoints. The gateway also runs background recovery work. PostgreSQL is the persistent data dependency; upstream model services and configured payment or detector integrations remain external services. The Compose profile includes PostgreSQL with a named volume, and the gateway runs embedded migrations at startup. Identity, requests, customer accounting, reservations and recovery have database-backed implementations. Their supported behavior and remaining acceptance requirements are tracked in the release checklist; their presence alone does not qualify the complete business journey.

Users should not need to assemble separate gateway, UI, proxy, and worker services for the initial installation. The container may contain runtime components required by its implementation. Avoid extra operational dependencies until measurements justify them.

## Startup and shutdown

Startup validates configuration, connects to PostgreSQL, applies compatible schema migrations, loads the configuration snapshot and starts background work before becoming ready. Invalid configuration or a missing secret required by saved data must stop startup with a clear error. Configure installation administration explicitly; the optional built-in demo account is customer-scoped and must not receive platform administration automatically.

Back up PostgreSQL before upgrading the application image, and record the image digest alongside the backup. The current embedded SQL migrations run transactionally on PostgreSQL. If a migration fails, startup must remain unavailable; the failed migration and its DDL transaction are not recorded as successful. Keep the database intact, use the migration error to repair the blocking schema or restore the pre-upgrade backup, then retry with the same pinned image. Do not point an older application image at a database that has already completed a newer migration unless that downgrade is explicitly supported.

Back up the deployment's configured `NIU_VENDOR_ENCRYPTION_KEY` separately in a private secret store. Restore that same key with the database: a new key, or an obsolete generated setup key, cannot decrypt the saved Provider credentials and startup rejects the configuration. A database backup does not contain this encryption key. Verify restoration in an isolated database before replacing a running deployment. Contain outbound access and recovery polling during verification so restored uncertain operations cannot be replayed unintentionally.

Maintainers can rehearse the pinned-package upgrade and recovery path with:

```sh
NIU_PREVIOUS_IMAGE='registry.example/niu@sha256:<previous-digest>' \
NIU_IMAGE='registry.example/niu@sha256:<candidate-digest>' \
python3 scripts/package-upgrade-smoke.py
```

Use images built from pinned revisions. The smoke script does not build or remove images. It reads the previous package’s successful migration version and preserves scoped records and the issued key’s model access. When migrations are pending, it injects a DDL failure, verifies failed startup without a successful migration record, removes the blocker, and retries the same candidate digest through the latest migration in this checkout. Migration-number gaps are supported. Same-schema packages test replacement and record preservation only, not migration-failure recovery. Temporary containers, network and configuration are removed on exit.

Fixture smoke outcomes provide no acceptance evidence. Qualify installation and upgrade behavior through actual current-input end-to-end execution and independent checks of final saved data and artifacts. A native executable run does not qualify the Linux container, and database restoration alone does not qualify application startup or recovery. Record unverified scope explicitly.

On shutdown, readiness is withdrawn and new work stops before active requests are drained. The shutdown deadline bounds draining; unfinished durable work resumes from PostgreSQL after restart.

## Storage and health

PostgreSQL is the source of truth for identity, provider configuration, budget reservations, request and attempt records, and the transactional outbox. Local caches may improve request latency but cannot silently become an independent global budget authority.

Liveness describes process health. Readiness checks required dependencies and the active configuration. Health responses must not expose credentials or detailed internal configuration.

## Packaging requirements

Images will use pinned build inputs, run as a non-root user, publish software bill of materials and image digests, and exclude research, development credentials, private source, and local build files. Release compatibility will include core version, schema version, and migration state.

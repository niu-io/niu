# Single-container deployment

Status: an evaluation image now builds the Rust gateway and TypeScript console together. PostgreSQL-backed production release has not been completed.

## Default installation

The target distribution is one Niu application container with one public port. It will provide inference APIs, the management API, the TypeScript static console, authentication, health endpoints, and background recovery work. PostgreSQL is the only persistent external dependency. The current Compose profile includes PostgreSQL with a named volume; the gateway runs embedded migrations at startup. Identity and attempt storage are implemented, while budget accounting and recovery remain incomplete.

Users should not need to assemble separate gateway, UI, proxy, and worker services for the initial installation. The container may contain runtime components required by its implementation. Avoid extra operational dependencies until measurements justify them.

## Startup and shutdown

Startup will validate configuration, connect to PostgreSQL, apply compatible schema migrations, load a valid configuration snapshot, start background work, and then become ready. Missing secrets or invalid configuration must stop startup with a clear error. Never generate a predictable default admin password.

Back up PostgreSQL before upgrading the application image, and record the image digest alongside the backup. The current embedded SQL migrations run transactionally on PostgreSQL. If a migration fails, startup must remain unavailable; the failed migration and its DDL transaction are not recorded as successful. Keep the database intact, use the migration error to repair the blocking schema or restore the pre-upgrade backup, then retry with the same pinned image. Do not point an older application image at a database that has already completed a newer migration unless that downgrade is explicitly supported.

For the current `provider_model` migration, maintainers can rehearse the pinned-package upgrade and recovery path with:

```sh
NIU_PREVIOUS_IMAGE='registry.example/niu@sha256:<previous-digest>' \
NIU_IMAGE='registry.example/niu@sha256:<candidate-digest>' \
python3 scripts/package-upgrade-smoke.py
```

Use images built from pinned revisions. The smoke script does not build or remove images; it starts a disposable PostgreSQL 17 instance, verifies the prior schema and scoped records, forces migration 16 to fail, then retries the same candidate digest after repairing the conflict. It removes its temporary containers, network, and config file on exit.

On shutdown, readiness is withdrawn and new work stops before active requests are drained. The shutdown deadline bounds draining; unfinished durable work resumes from PostgreSQL after restart.

## Storage and health

PostgreSQL is the source of truth for identity, provider configuration, budget reservations, request and attempt records, and the transactional outbox. Local caches may improve request latency but cannot silently become an independent global budget authority.

Liveness describes process health. Readiness checks required dependencies and the active configuration. Health responses must not expose credentials or detailed internal configuration.

## Packaging requirements

Images will use pinned build inputs, run as a non-root user, publish software bill of materials and image digests, and exclude research, development credentials, private source, and local build files. Release compatibility will include core version, schema version, and migration state.

# Single-container deployment

Status: target deployment contract. No application image has been built yet.

## Default installation

The target distribution is one Niu application container with one public port. It will provide inference APIs, the management API, the static console, authentication, health endpoints, and background recovery work. PostgreSQL remains a persistent external dependency. A minimal Compose file may start Niu and PostgreSQL together for local evaluation.

Users should not need to assemble separate gateway, UI, proxy, and worker services for the initial installation. The container may contain runtime components required by its implementation. Avoid extra operational dependencies until measurements justify them.

## Startup and shutdown

Startup will validate configuration, connect to PostgreSQL, apply compatible schema migrations, load a valid configuration snapshot, start background work, and then become ready. Missing secrets or invalid configuration must stop startup with a clear error. Never generate a predictable default admin password.

On shutdown, readiness is withdrawn and new work stops before active requests are drained. The shutdown deadline bounds draining; unfinished durable work resumes from PostgreSQL after restart.

## Storage and health

PostgreSQL is the source of truth for identity, provider configuration, budget reservations, request and attempt records, and the transactional outbox. Local caches may improve request latency but cannot silently become an independent global budget authority.

Liveness describes process health. Readiness checks required dependencies and the active configuration. Health responses must not expose credentials or detailed internal configuration.

## Packaging requirements

Images will use pinned build inputs, run as a non-root user, publish software bill of materials and image digests, and exclude research, development credentials, private source, and local build files. Release compatibility will include core version, schema version, and migration state.

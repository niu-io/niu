# External detector transport verification

Reviewed 2026-10-06. This is a transport foundation; F09 remains incomplete.

Four focused gateway tests passed with real local HTTP fixtures. They cover authenticated versioned requests, clear/matched responses, incompatible version/revision, unknown response fields, oversized response, whole-operation timeout, unsuccessful service status, immediate concurrency exhaustion, text limits, invalid configuration, unauthenticated preview rejection, explicit-consent rejection, and a no-store non-enforcing response when credentials are absent. No paid detector or LLM was called.

The installation-only preview endpoint is reachable in the gateway router. These tests do not qualify ordinary-role integration, saved-policy enforcement, durable decision auditing, external processing guarantees, detector accuracy, prices or streaming. See the [experimental transport contract](../reference/external-detector-transport.md).

The first complete regression exposed a race between Reqwest's timeout and the outer operation deadline. Timeout errors are now normalized in both send and body collection. After that correction, the fresh PostgreSQL complete gateway regression passed 185 main tests and the separate process-replacement integration test, with no ignored or filtered tests. Gateway Clippy passed for all targets with warnings denied. The public-tree/build-input boundary scan passed over 1,055 files. This qualifies the tested transport and existing local regressions, not an external detector or the full release.

## Processing-description consent binding

The installation administrator now reads a no-store processing description before sending synthetic text. The test request must contain its current configuration fingerprint and explicit consent. The fingerprint binds every declared configuration field; stale or forged fingerprints fail before inspection. The description labels processing guarantees as declared/unverified and external charges as unknown. It excludes endpoint URLs and credential environment names. It does not hash or expose credential values.

Five non-database detector tests passed after this change. The fresh complete PostgreSQL gateway regression then passed all 187 main tests plus the separate process-replacement test, with no ignored or filtered tests. Its additional role test proves that workspace Owner, Admin and Viewer identities receive HTTP 403 on description and preview endpoints; inference keys receive HTTP 401. OpenAPI YAML parsing, all-target gateway Clippy with warnings denied, changed-file whitespace checks and the 1,055-file public-boundary scan passed.

This establishes description and synthetic-consent binding. It does not establish workspace-scoped production consent, detector decision persistence, request/attempt correlation, revocation during in-flight requests, billing or external-service guarantees. No live policy or Supplier credential was modified.

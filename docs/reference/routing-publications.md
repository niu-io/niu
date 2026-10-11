# Routing publications

## Configuration and dispatch

The Gateway compiles stored Supplier mappings, pool policies, ownership, offer and
qualification references, and static TOML models into one immutable generation.
Disabled managed aliases continue to shadow static aliases. Compiled records
contain no plaintext or encrypted credentials. Endpoints and procurement metadata
remain server-only; never project the stored compilation to customer responses.

Route-affecting writes acquire publication serialization before domain locks.
Compilation, configuration writes, audit events, generation creation and pointer
replacement share one transaction. Failure rolls back the mutation. Database
writer guards reject older writers after activation, and deferred constraints
reject changed rows committed without a publication. Ciphertext-only offline
master-key re-encryption does not change a routing revision.

Catalog reads and text selection retain complete immutable definitions. Reloads
cannot overwrite a newer process-local generation with an older one. Every read
checks the active database pointer; failed reloads retain the previous cache but
fail the request rather than inventing a replacement definition. Credential
secrets are loaded only after selection and matching revisions are checked.
Cooldowns, qualification expiry/revocation and API-key policies remain live.

Text admission, including priced, personal, batched unpriced and bounded retry
paths, saves `attempt_route_generations` in its attempt transaction. Video creates
save the selected generation with the fresh submission identity. Idempotent
replays retain their original attempt and generation. Dispatched work retains its
original selected route. Historical attempts are not backfilled. Private Codex
account selection is outside this registry and remains explicitly unattributed.

## Startup and deliberate static replacement

Bootstrap preparation skips existing immutable bootstrap identities, including
renamed or disabled configurations. All new imports and their initial publication
commit together. Required unshadowed static credential references must be usable
before publishing. Matching restarts validate the compilation but do not create
another generation. Existing administrator edits are never reset by bootstrap.

Read `GET /admin/v1/routing-registry` with platform-administrator authorization.
Its `data` contains `generation` as a decimal string, `format_version`, and
`local_static_configuration_matches`. It returns no route definitions, secrets,
credential references or prices and uses `Cache-Control: no-store`. The JavaScript
admin client exposes `getRoutingRegistryStatus()`.

To intentionally replace static TOML configuration, record the current generation,
update the deployment configuration and start the Gateway with
`NIU_ROUTING_EXPECTED_GENERATION` set to that recorded value. The replacement
succeeds only if that generation is still current when publication serialization
is acquired. Otherwise startup fails without replacing the active publication;
inspect the new state before trying again. Remove the one-time setting after the
rollout. An unchanged restart remains idempotent even if it is still present.
Existing Gateways with superseded static configuration reject new registry reads
until restarted with matching configuration; already dispatched work can finish.
Do not downgrade route writers after migration/activation without restoring a
compatible backup. This mechanism does not synchronize environment secrets across
machines or authorize a commercial Supplier offer.

## Current-input verification

The isolated native implementation exercised these paths without fixture evidence:

- Sixteen concurrent writes of the same pool revision yielded one successful
  configuration and publication. A deliberately rejected generation insert rolled
  back its configuration and audit writes. Independently reopened data also
  rejected an older writer, an unpublished commit and immutable-history edits.
- Concurrent model/pool edits produced 24 complete successive publications. Four
  overlapping requests were refused with configuration conflicts, and a subsequent
  real request completed. Independent history inspection found one configured
  revision change per generation and matched attempt definitions and response usage.
- A real managed stream retained its earlier generation and exact single customer
  debit after its credential was disabled. New requests and restart did not use a
  same-name static fallback. A later run overlapped credential disablement and
  model metadata publication while that stream was already returning data.
- Missing static credentials and conflicting bootstrap aliases left no imported
  configuration, audit or generation rows. Successful import created one complete
  initial publication. Administrator disablement survived restart without the
  original bootstrap environment secret. Missing/stale replacement expectations
  preserved the prior publication. An authorized static replacement then served
  a real model call with matching generation, response usage and exact debit.
- A personal video submitted once, retained its original generation through an
  unrelated publication, API-key rotation and restart, and reused the original
  attempt on idempotent replay. Recovery reached success. The downloaded artifact
  matched its retained digest and independently completed full FFmpeg decoding.
  No customer financial entries were created for this personal upstream job.

Text accounting used explicit internal verification prices and credit. These
observations do not claim merchant funding, discounted commercial supply, every
native protocol combination, all maintenance/upgrade paths, or a capacity SLO.
The remaining boundaries keep the complete release and broader routing issue open.

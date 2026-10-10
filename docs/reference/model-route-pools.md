# Model route pools

A route pool exposes one customer model alias backed by multiple existing
credential/model mappings. Workspace key grants, operations, customer tariffs
and customer-visible response model names use the pool alias. Each attempt
separately binds the selected mapping, credential/model revisions and pool
revision. Historical bindings do not change when a pool is edited.

This is selection before dispatch. It does not retry a failed generation, switch
routes after a partial stream, or resubmit uncertain work. Video mappings and
reserved `codex/` aliases are excluded from this generic text mechanism.

## Administration

The [OpenAPI contract](../../contracts/model-route-pools.openapi.yaml) exposes
installation-only operations:

- `GET /admin/v1/model-route-pools?alias=...` reads a pool.
- `PUT /admin/v1/model-route-pools` creates or updates a pool with `alias`,
  `organization_id`, `enabled`, `expected_revision` and `candidates`.
- `GET /admin/v1/model-route-pools/history?alias=...&before_revision=...` returns
  at most 100 immutable revisions in descending order.

Start with expected revision zero. Updates must match the current revision.
Pool ownership is immutable: a personal pool belongs to one organization; a
shared pool has null ownership. Every personal candidate must belong to that
same organization. Shared candidates must be nonpersonal mappings with configured
price bounds; existing Supplier eligibility checks still apply during selection.
Creating a pool does not qualify an offer or activate customer funding.

A pool has 1–64 distinct candidate mapping aliases. Each candidate specifies
`enabled`, priority from -1000 to 1000, and weight from 1 to 10000. These aliases
refer directly to stored mappings, not recursively to other pools. A pool alias
takes precedence over an ordinary mapping or static configuration with the same
name. Disabling the pool does not silently restore that older route.

The JavaScript SDK provides `getModelRoutePool`, `setModelRoutePool` and
`listModelRoutePoolHistory`, with dedicated pool/input/candidate/revision types.

## Selection and admission

Disabled mappings and credentials, foreign personal credentials, unsupported
protocols and ineligible shared offers are excluded. Among eligible candidates,
the highest priority is selected, then weights choose within that priority tier.
Chat, Responses and embeddings use their respective protocol declarations.
Tool, structured-output, input/output-size and other request-specific constraints
are still validated against the selected route; this implementation does not
reselect on those validation failures. Operators must configure compatible
candidates for their intended request shapes.

Pool aliases appear in the applicable authenticated model listing; this increment
does not publish them in the anonymous public catalog. A key granted only the
pool alias does not gain permission to call candidate aliases directly. Foreign
organizations cannot resolve a personal pool even with a wildcard key.

An enabled pool with no eligible candidate returns HTTP 503
`route_pool_unavailable`. Disabled or inaccessible pools return 404. A pool or
selected mapping revision changed before dispatch returns HTTP 409
`route_configuration_changed`, with no upstream submission for that request.
Admission rechecks membership, enabled state, ownership and revisions under
database locks. Company, workspace and key controls remain applicable.

Customer tariffs bind by pool alias; Supplier offers bind by selected mapping.
Shared pools require priced admission rather than the legacy unpriced batch
path. Personal pools remain upstream-owner-funded and produce no customer debit.

## Current-input verification — 2026-10-10

After a private database backup, additive migration 0213 was applied and the
optimized gateway restarted using the existing database and encryption identity.
Two independent temporary configurations used the existing private upstream test
secret. Both belonged to the personal account and targeted the actual Chat model;
only the second mapping declared Responses support. No commercial offer or
settled payment was fabricated.

Actual API calls and independent PostgreSQL inspection established:

- Chat selected the higher-priority mapping; Responses selected the eligible
  lower-priority mapping instead of the mapping lacking Responses support.
- Disabling the first pool member selected the second for a subsequent Chat call.
- Responses retained the pool alias. Each completed attempt retained that customer
  resource identity plus its selected mapping and pool revision. Recorded usage
  matched the actual response for all four completed calls.
- Updating the pool while an admitted preparation waited before dispatch returned
  409 `route_configuration_changed`. Its old-version attempt stayed `not_sent`
  with no dispatch timestamp. Disabling the pool returned 404; enabling it with
  no enabled members returned 503 `route_pool_unavailable`.
- Eight concurrent management writes using one revision produced one saved new
  revision and seven conflicts; immutable history matched the saved revisions.
- A workspace owner could not read or change installation pool configuration.
  Changing pool ownership was rejected. A key restricted to the pool could not
  call a candidate alias. A foreign organization could neither grant the private
  pool explicitly nor invoke it through a wildcard key.
- Final database inspection found five bound preparations, four dispatched
  completions and one undispatched stale request. Customer ledger entries remained
  zero. The original credential's revision and ciphertext digest were unchanged.

The temporary pool, mappings and credentials were disabled, and temporary keys
and operator credentials revoked. The built SDK read the resulting disabled pool
and history from the actual service and matched its current revision.

Formatting, release compilation, Clippy, test-target compilation, SDK checking/
build and OpenAPI parsing completed. Fixture results supply no evidence.
Nondegenerate same-priority weighted traffic, embedding pool calls, customer-paid
pool admission/settlement, native adapters, larger catalogs and sustained
contention remain unverified. This increment does not provide health cooldowns,
circuit breaking or safe post-rejection failover, and does not establish New API
parity or production capacity.

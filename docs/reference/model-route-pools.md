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
Chat streaming, tool calls, streaming tool calls and structured JSON declarations
now filter candidates before priority/weight selection. Embedding dimensions and
base64 options likewise require the corresponding declared capabilities. Request
syntax is validated before selection; selected-route validation remains in place
after input inspection. Input/output-size and price-specific bounds still apply
after selection and do not trigger reselection.

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
Long-run weighted distribution, customer-paid
pool admission/settlement, native adapters, larger catalogs and sustained
contention remain unverified. This increment does not provide health cooldowns,
circuit breaking or safe post-rejection failover, and does not establish New API
parity or production capacity.

## Same-priority weighted current-input traffic

A subsequent run configured two independent temporary personal credential/model
mappings at equal priority with weights one and three. Thirty-two actual short
Chat requests ran with concurrency four and an explicit eight-token output limit.
All returned nonempty responses using the customer pool alias. The two candidates
were selected 12 and 20 times respectively.

Independent PostgreSQL inspection matched every HTTP response to one completed
dispatch, the selected candidate, pool revision one, the unchanged customer model
identity and exact prompt/completion counts. Both configured candidates received
actual traffic. The customer ledger remained empty, and the original credential
revision/ciphertext digest stayed unchanged. Temporary pool, mappings and
credentials were disabled and temporary keys revoked after the run.

This verifies nondegenerate weighted selection with concurrent actual traffic and
durable attribution. The observed counts are a finite sample, not a statistical
qualification of the long-run 1:3 distribution or a production-throughput result.
Both temporary configurations used the same personal upstream test secret; this
does not establish independent upstream-account capacity or commercial supply.

## Batched candidate resolution

Candidate mapping, enabled-state, ownership and shared-offer eligibility reads
now run in one database statement after loading the pool configuration. Previously
the gateway issued a mapping lookup, an ownership lookup and, for eligible shared
priced mappings, a separate availability lookup for each enabled candidate.
The new read accepts at most 64 configured candidates and skips database work when
none is enabled. Protocol filtering and weighted selection retain their existing
semantics. Dispatch still independently locks and rechecks the selected binding.

The actual priority/protocol workflow above was rerun on the updated optimized
gateway. Four completed upstream calls matched selected mappings, pool revisions,
customer aliases and reported usage in PostgreSQL; the stale pool request stayed
undispatched. Disabled/no-eligible handling, foreign-scope rejection and concurrent
policy updates were also exercised. Temporary configuration was disabled and
credentials revoked afterward.

Compilation and Clippy completed. The reduction in gateway/database query
round trips follows from the implemented query structure. Large-pool latency,
shared-offer performance and sustained throughput have not been measured, and
this change does not establish a production-capacity improvement.

## Request capability selection

An actual owner-funded run configured a higher-priority plain Chat mapping and a
lower-priority mapping declaring tools, streaming tools and structured output.
Forced function calls, streaming function-call arguments and strict JSON output
selected the capable mapping. Returned arguments/content were parsed and matched
the requested object; the stream reached its completion marker. Plain Chat still
selected the higher-priority mapping. Independent PostgreSQL reads matched all
four completions to the selected mapping, pool revision and exact reported usage.

Malformed request shapes returned 400. The unsupported combined tools/structured
output request returned 501. Disabling the capable member made a valid tool
request return 503 `route_pool_unavailable`; malformed tools still returned 400.
These rejections created no additional attempts or dispatches. The customer
ledger remained empty and the original credential revision/digest was unchanged.
This run does not qualify embedding option selection, paid settlement, actual
external tool execution or price-bound-aware reselection.

## Embedding option selection

A subsequent actual owner-funded run used two independent temporary mappings for
the same embedding model. Both declared embeddings; only the lower-priority
mapping declared configurable dimensions and base64 encoding. A 64-dimensional
float request and a 64-dimensional base64 request selected that mapping. A request
without either option selected the higher-priority mapping and returned 1536
dimensions.

Independent response inspection decoded base64 into 64 little-endian float32
values and checked all returned values were finite. PostgreSQL records matched
each response's customer pool alias, selected mapping, revision, completion and
reported prompt usage, with zero completion tokens. After disabling the capable
member, a dimensioned request returned 503; an invalid zero dimension returned
400. Neither created another attempt: exactly three attempts were dispatched and
completed. The customer ledger remained empty and the original credential
revision/ciphertext digest was unchanged. Temporary pool, mappings and credentials
were disabled and temporary keys revoked.

This extends current-input capability-selection evidence to embedding options.
It does not qualify vector semantic quality, arbitrary dimension support, paid
settlement, independent upstream-account capacity or production throughput.

## Embedding response integrity

The gateway validates base64 embedding results as nonempty, decodable float32
vectors with a whole number of components, finite values and the requested
dimension count when supplied. Float-array results must also be nonempty.
Invalid vectors take the existing safe upstream-error path rather than being
returned as successful embedding data; no automatic retry is introduced.

The [official Python client parser](https://github.com/openai/openai-python/blob/main/src/openai/lib/_parsing/_embeddings.py)
also decodes base64 embeddings into float32 values. Niu's supported binary
interpretation here is little-endian float32, matching the current-input upstream
vectors independently decoded in the embedding checkpoint above. This does not
qualify arbitrary upstream adapters or semantic vector quality.

After rebuilding and restarting the gateway, the actual embedding capability
workflow was repeated. Float and base64 responses decoded to the requested
dimensions, and final PostgreSQL records matched selected routes and exact usage.
Temporary configuration was disabled and keys revoked. Release compilation and
Clippy completed. Malformed upstream vectors, nonfinite binary values and
dimension-mismatch rejection have implementation checks but no current-input
upstream failure evidence; their integrated behavior remains unverified.

## Embedding failure diagnosis

Embedding dispatch now uses the same bounded, sanitized upstream rejection
classification as Chat. Non-success HTTP status is preserved with a static safe
message and durable failure kind/status; transport and malformed-response paths
also use the existing typed diagnostics. Raw upstream messages, metadata and
credentials are not returned. This changes the former generic embedding 502
behavior for upstream HTTP rejections; it does not add retries.

An actual request through an independent temporary personal mapping named a
nonexistent upstream model. The upstream returned 400, and the customer response
retained 400 with the static safe message. Independent database inspection found
one dispatch with `upstream_http_error`, upstream status 400 and conservative
`may_have_executed` execution. No customer debit was posted, the original
credential revision/digest was unchanged, and temporary keys/configuration were
revoked/disabled. An HTTP rejection alone does not automatically prove
nonexecution or release uncertain liabilities. Transport, regional rejection and
malformed-response classification remain unverified by actual fault runs.

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
handler-generated platform administration operations (installation credentials or
an explicitly authorized platform administrator; ordinary company/workspace
ownership does not grant access):

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

## Undeliverable vectors and incurred usage

Embedding result validation and execution accounting are separate. When an HTTP
success response contains a synchronous `list` envelope with the expected number
of indexed `embedding` items and valid reported usage, an invalid vector still
returns the safe invalid-response error but preserves completed execution and
reported input usage. Completion tokens are zero by the embedding contract.
Missing terminal-envelope or usage evidence leaves the invalid response unresolved.
The gateway does not turn a delivery error into an automatic retry or free work.

This aligns the embedding implementation with the existing Chat distinction
between upstream completion and usable output. The malformed-vector accounting
branch has no actual upstream fault evidence and remains unverified, including
its customer-priced settlement effects.

On the updated optimized gateway, actual float/base64 requests again produced
independently decoded vectors and exact durable usage. A separate actual upstream
400 retained its safe status/diagnostic and unresolved execution without customer
debit. Temporary configurations were disabled and keys revoked. These observations
cover normal results and HTTP rejection, not the malformed-vector completion
branch. Release compilation and Clippy completed.

## Customer-priced candidate switch checkpoint

On 2026-10-10, a current native run used an isolated database, the saved personal
OpenRouter credential, internal verification tariffs and approved credit. Two
candidate mappings shared the same actual upstream service/model; no commercial
offer, merchant funding or alternative Supplier qualification was created.

The first real structured completion used the higher-priority candidate in pool
revision 1. Management then disabled that candidate in revision 2. After restart,
a real plain-text stream used the remaining candidate. Independent database reads
matched each attempt's immutable candidate alias, pool alias and pool revision;
both attempts retained the same customer-visible resource alias. This is an
explicit configuration change between requests, not automatic failure retry.

| Request | Reported input/output tokens | Customer charge, USD nanounits |
| --- | --- | ---: |
| Structured, first candidate | 46 / 10 | 15,556 |
| Stream after restart, second candidate | 15 / 6 | 7,778 |

Both outputs matched their fresh requested marker. Independent arithmetic using
the customer pool tariff matched each charge and debit; configured procurement
expenses were checked separately and did not replace customer charges. The
23,334-nanounit total matched reconciliation and a settled statement. Reservations
were released. Zero-credit admission initially refused without an attempt;
a key cap later refused additional execution. A balance refund was idempotent,
and another restart preserved exactly the original charges and debits. Temporary
access was revoked and isolated processes stopped; original credentials and the
development database were unchanged.

The first verification attempt assumed lower numbers had higher priority. Its
actual selected route agreed with the documented highest-priority rule. The
corrected complete run above used that rule. This checkpoint does not qualify
candidate changes during dispatch, distinct Supplier expense schedules, overload,
commercial resale, automatic failover or safe retry of an uncertain attempt.

## Distinct configured expenses and historical repricing

A second current-input run used two independently stored credential records and
model mappings with different internal procurement rates, backed by the same
personal upstream account and model. The customer tariff remained attached to
the pool alias. Each actual request's durable binding selected the expected
credential record, model revision and pool revision; its expense matched separate
arithmetic using that candidate's configured rates. These verification rates are
not external Supplier invoices or evidence of independent commercial supply.

After the first structured completion, its mapping's procurement price was
changed. Independent SQL inspection confirmed the original expense stayed fixed.
The first candidate was then disabled in the next pool revision; after restart,
a real text stream selected the second candidate and its different expense rates.
Customer charges were 15,433 and 7,655 USD nanounits from reported token counts
45/10 and 14/6 respectively, totaling 23,088. Those charges used the unchanged
customer tariff rather than either procurement rate.

The complete run also checked exact balance debits, released holds, reconciliation,
a settled statement, key-cap refusal, idempotent balance refund and preservation
of charges/debits after another restart. Both temporary credential records were
disabled and the API key revoked before stopping the isolated processes. Original
development data and encrypted identity were unchanged. This extends configured
price/binding evidence, not automatic failover, concurrent configuration changes
during dispatch, or commercial Supplier qualification.


## Management contract checkpoint

Read, write and revision history now derive their OpenAPI descriptions from the
Rust handlers. A current isolated HTTP run verified installation-authorized reads,
revisioned disable and history pagination, while ordinary company-owner and
workspace-key credentials were denied. Invalid cursor zero, unknown input fields
and stale writes were rejected. Restart retained the disabled pool and both
immutable revisions; independent database reads found no inference attempts or
financial entries. This management-only run did not exercise an explicitly granted platform-member
session; the later platform-grant checkpoint below covers that boundary.


## Platform grant independent of customer role

A current native request exposed a coupling in the old authorization path: a
company viewer with an explicit platform-admin grant still received 403 on pool
read because the Supplier helper required customer operator-management permission.
Pure platform handlers now authenticate the session and check the separate
platform grant through one shared helper. Customer authorization is unchanged.

In an isolated current-input run, a company viewer initially received 403. A
database-administrator grant, recorded with its immutable grant event, enabled
pool read/write, Supplier configuration read/write and branding read/write through
the existing session. Restart preserved that access. Foreign-workspace key reads,
customer workspace creation and installation-only credit policy remained denied.
Revoking the grant with its audit event immediately restored 403 on pool and
Supplier access while own-workspace key reads still worked. Independent database
checks found two grant events, zero inference attempts and zero financial entries.
This verifies the exercised API authorization boundary, not browser grant
management or every payment/media-pricing business workflow.

## Candidate change during an actual priced stream — 2026-10-10

A fresh native gateway/database used two configured supply mappings to the saved
personal upstream account, a separate customer pool alias, explicit internal
retail/procurement tariffs and approved company credit. No commercial Supplier
qualification or received-money funding was asserted.

A real structured stream on the higher-priority candidate began returning content.
Independent database reads immediately before and after the pool update still
showed its execution as `may_have_executed`. The update disabled that candidate
in pool revision 2. The already-dispatched stream completed its exact requested
marker and all integers from 1 through 400 using its original candidate/revision 1.
A new concurrent request completed its requested marker using the other candidate
and pool revision 2. These are separate customer requests, not a fallback retry.

Both retained responses were parsed for complete content and provider-reported
usage. Independent SQL matched each attempt's selected mapping, pool revision,
unchanged customer alias, prompt/completion counts, exact customer charge and
matching balance debit. Configured procurement arithmetic was checked separately.
Restart retained exactly two attempts and two charges; no open reservation
remained and original-charge reconciliation matched without discrepancies.
Temporary access was revoked, isolated processes stopped and the original saved
credential identity remained unchanged.

This qualifies the exercised in-flight pool-membership change and pinned
settlement. Disabling a candidate prevents its selection for new work; it does
not cancel already-dispatched work. The run does not qualify credential revocation
races, in-flight tariff changes, automatic failover or sustained routing capacity.

## Customer reporting after the in-flight update

The retained database from the preceding actual two-request run was reopened
without generating another response. A company viewer read both populated request
details and the request list. Customer model aliases, prompt/completion counts and
exact charge strings matched independent attempt/charge reads, and completed
requests had nonnegative saved duration. Installation reads returned identical
customer detail objects rather than adding procurement information.

The serialized objects contained no Supplier expense/rate, credential endpoint,
procurement price revision, selected mapping alias or pool revision. A foreign
company owner received 404 for both request details. The customer viewer received
403 from the separate procurement-cost endpoint. After gateway restart, detail
objects remained identical and SQL still contained only the original two attempts
and two charges. Temporary member access was revoked and isolated processes were
stopped. This qualifies the exercised list/detail scope and serialization boundary;
it does not qualify every export or a platform routing-diagnostics API.

## Discover and paginate managed pools

`GET /admin/v1/model-route-pools/index` lists current shared and personal pool
configurations for installation credentials or explicitly granted platform
administrators. Ordinary company ownership and inference keys do not grant access.
Enabled and disabled pools are included. Results contain the same pool objects as
the existing alias lookup, without credentials, endpoints or procurement prices.

Use `limit` from 1 to 100 (default 50). The response is
`{data: [...], has_more: boolean, next_after: string | null}`. Pass `next_after` as
`after` to continue strictly beyond that alias in database ordering. Cursors accept
1–200 visible ASCII bytes and need not name an existing pool. A final or empty
page has `has_more: false` and `next_after: null`. Unknown query fields and invalid
page sizes/cursors return 400. This live traversal is not a snapshot: start again
to discover aliases inserted before the current cursor.

The JavaScript SDK exposes `admin.listModelRoutePools({after, limit})`. The existing
`getModelRoutePool(alias)` and history responses are unchanged. The new route is
implemented and its OpenAPI derives directly from the handler annotation.

### Current-input index verification

A fresh native gateway/database saved 106 shared pool configurations through the
management API, including enabled and disabled pools. Seventeen-item HTTP pages
and nineteen-item pages from the built JavaScript SDK independently traversed the
same complete alias order as SQL. Every returned pool matched its single-alias
HTTP lookup; the default first page contained 50 entries. An absent high cursor
returned an empty final page. Invalid limits, empty/whitespace cursors and unknown
query fields returned 400.

An ordinary company owner received 403 and an inference key received 401. A
company viewer with an explicit audited platform grant received the same first
page as installation credentials. Restart preserved that page; revoking the grant
immediately restored 403. Independent SQL found no inference attempts or balance
entries. The original database and encrypted credential identity were unchanged.
This verifies the exercised management/SDK traversal, not inference availability,
large-dataset performance or a cross-page snapshot during concurrent updates.

## Complete inference discovery beyond 1,000 pools

The management index and inference discovery are separate callers. The old
inference path selected only the first 1,000 stored pools before applying enabled
state and tenant rules. An actual isolated database with 1,003 API-created pools
reproduced a missing eligible alias beyond that prefix in `/v1/models`.

Inference discovery now traverses the shared keyset reader in bounded database
pages instead of returning an arbitrary prefix. A new current-input run with
1,003 saved pools exposed the final eligible alias, retained the other enabled
pool and excluded all 1,001 disabled aliases. Independent SQL confirmed the saved
pool count and the final alias's position; the HTTP model response was retained.
Gateway restart preserved the same discovered alias set. No inference attempts
or balance entries were created; original data and encrypted identity were unchanged.

This fixes discovery completeness for the exercised pool population. It does not
qualify model execution or capacity with thousands of active routes. Database
fetches are bounded, while the compatibility model list still assembles its full
response in memory; live traversal is not a cross-page snapshot.

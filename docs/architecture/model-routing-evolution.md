# Model routing: current constraints and required implementation

Status: evolving implementation design, 2026-10-10. The additive
[text route pool implementation](../reference/model-route-pools.md) now provides
candidate administration and pre-dispatch selection, with bounded Chat failover
for qualified OpenRouter authentication rejection. Broad business failover and
paid pool qualification remain open.

## Inspected current structure

`vendor_models.alias` is the primary key introduced by migration 0013. A mapping
selects one `vendor_id`. `provider_offers.model_alias` is unique and references
that mapping. Creating independent Supplier credentials therefore does not make
them interchangeable candidates for one customer model by themselves. Migration
0213 adds pools above these existing mappings without rewriting their aliases or
history. Multiple mappings can target the same upstream model under different aliases.

`vendors/models.rs` resolves an owner-scoped personal route, a shared stored route,
or a static model. `begin_attempt` binds customer tariffs by public model and
Supplier offers by the selected alias, upstream model and endpoint. The existing
offer binding validates those values and current eligibility. Changing only the
resolver to pick another alias would break these relationships; adding an HTTP
retry loop would not solve that problem.

The pinned New API
[ability implementation](https://github.com/QuantumNous/new-api/blob/1d4328e97417a043a161a0dd30a5b129be3ace49/model/ability.go)
models group/model/channel membership, enabled state, priority and weight. Its
selection filters candidates, selects a priority tier and makes a weighted
choice. This is a source-level capability reference, not a claim about runtime
reliability or Niu parity. No upstream code is imported here.

## Required separation

1. **Customer model identity:** the public alias remains the key for workspace
   grants, catalog visibility, customer tariff selection and customer reporting.
   A route change must not silently replace that identity or retail tariff.
2. **Supply mapping identity:** a separate immutable identity binds a credential,
   adapter, endpoint, upstream model, capabilities and Supplier offer revision.
   Multiple supply mappings may serve the customer model.
3. **Candidate policy:** a revisioned pool specifies eligible mappings, priority,
   weight and enabled state. Owner-funded pools stay owner-scoped and cannot
   introduce personal credentials into shared commercial supply.
4. **Attempt binding:** persist the selected mapping and relevant revisions before
   dispatch; recheck enabled state, ownership and eligibility transactionally.
   Credential changes must not leave the recorded selection describing different
   upstream work from the request actually sent.

Keep existing aliases and records valid through additive migration and an
explicit compatibility mapping. Do not drop the current primary key or rewrite
historical attempt, tariff or settlement references to introduce candidate pools.

## Admission and financial invariants

Select an eligible candidate before reserving its bounded liability. Pin the
customer tariff independently from the candidate's confidential Supplier rates.
All company, workspace and key controls apply to the same customer operation.
An alternate candidate may require a different procurement bound; it must not
reuse an incompatible bound or invalidate prior unresolved liabilities.

Each upstream submission needs a distinguishable durable attempt. Do not count
multiple submitted attempts as one execution merely because they belong to one
customer operation. Define customer request-limit and token-budget treatment
explicitly before enabling retries; current limits count dispatched attempts.

Uncertain completion, partial response delivery and a lost commit acknowledgment
must not authorize another billable submission. A generic HTTP status alone is
insufficient to prove nonexecution across every adapter. Adapter-specific safe
rejection contracts, a maximum attempt count and an overall deadline are required.
Saved video jobs remain pinned to their originating route and job identity;
polling must not create a replacement generation on another Supplier.

## Delivery sequence and acceptance

| Increment | Required result | Current status |
| --- | --- | --- |
| Durable selected-route binding | Configuration races reject before dispatch; historical selection stays inspectable | Generic managed-route binding implemented; actual personal Chat model-revision race verified, broader paths open |
| Separate customer models and supply mappings | Multiple credentials serve one customer alias without changing grants or tariffs | Additive text pools implemented; actual personal alias/grant behavior and credit-backed customer tariff/expense separation verified |
| Candidate administration | Revisioned membership, priority, weight, enabled state and scoped history | Implemented with actual configuration/history/concurrency evidence |
| Candidate selection | Eligible priority/weight selection, no disabled or foreign personal routes, defined no-route response | Implemented; actual priority/protocol/disabled-member selection, scope rejection and concurrent weighted traffic verified; long-run distribution open |
| Safe failover orchestration | Distinct attempts, bounded retries and deadlines, no uncertain resubmission | Bounded Chat OpenRouter authentication-rejection successor implemented; broader adapters/statuses and failure combinations open |
| Health and recovery | Defined cooldown and re-entry under concurrent gateways without a probe flood | Qualified canonical OpenRouter authentication-refusal cooldown implemented; cross-adapter qualification remains open |
| Financial and performance qualification | Actual multi-candidate traffic reconciles reservations, charges and route attribution under contention | [Actual priced selection and in-flight membership change](../reference/model-route-pools.md) reconciled; broad contention/capacity remain unverified |

For delivery, verify current-input requests and independently inspect selected
route records, HTTP results, actual usage, reservations and ledger artifacts.
Include configuration changes during admission, revoked credentials, concurrent
selection, partial streams, restart and no eligible candidates. Fixture results
do not establish any row above. External merchant activation and coverage of
every possible upstream service are not prerequisites for internal capability.

See [managed route bindings](../reference/managed-route-bindings.md) for the
implemented first increment and the exact current-input verification boundary.

## Admission-path review before bounded failover

A source inspection at `4c2500f` identifies two prerequisites before adding a
Chat retry loop. `Store::prepare_gateway_attempt` generates a new operation and
attempt together. `Store::insert_gateway_attempt` unconditionally inserts the
operation, and `admit_priced_gateway` calls it within the dispatch transaction.
Calling `begin_attempt` again therefore does not append a retry to the original
operation. Separately, priced admission calls `bind_customer_tariff_in_tx` for
each new attempt, so repeating admission without an operation-level price binding
can select a different customer tariff after an administrative edit.

That review identified these storage requirements:

1. Preserve the first operation's scope, public model and task attribution. Add
   an explicit append-attempt transaction under an operation lock; do not make
   the existing insert silently reuse arbitrary conflicting operation IDs.
2. Store the operation's customer-price selection once. Subsequent attempts must
   reuse that immutable selection, while independently binding the selected
   Supplier route/offer and its procurement liability. Personal operations must
   remain personal and cannot switch to customer-funded supply during failover.
3. Require durable, adapter-specific nonexecution evidence for the immediately
   preceding dispatched attempt before authorizing another. Release its eligible
   reservations transactionally; an unknown result or uncertain commit must not
   become a retry grant. Persist ordinal, predecessor and bounded policy revision
   so concurrent gateways cannot create two successors.
4. Apply one overall deadline and a maximum number of submitted attempts. Continue
   counting each dispatch against current key RPM and token/concurrency policies;
   do not reset policy identities or hide work by reusing an attempt ID. Recheck
   current model grants, route revisions and Guardrails for every new dispatch.
5. Only then connect the Chat orchestration to candidate exclusion and selection.
   Preserve the public alias and operation price, forbid retry after downstream
   output begins, and expose every attempt through authorized diagnostics without
   leaking procurement data. Video recovery remains query-only for its original
   job and is outside this text retry mechanism.

These were implementation prerequisites at that review checkpoint. The bounded
Chat successor section below records the subsequent implementation; broader
competing-successor, unknown-commit and cross-adapter qualification remains open.

## Operation retail-tariff binding foundation

Migration 0223 adds an immutable `customer_operation_tariffs` binding and preserves
existing attempt bindings through an exact backfill. A conflicting historical
operation aborts the migration instead of selecting a tariff or repricing history.
A database trigger serializes new attempt-tariff bindings on the operation row
and rejects a different tariff revision. The standard tariff-binding path prefers
an already pinned operation revision over the current administrative revision.

Migration 0223 alone did not append attempts or enable failover. At that checkpoint,
safe predecessor evidence, operation-level retry policy and append-attempt
admission were still required; migration 0226 and the Chat path below add them.

Current-input verification used a fresh native database and three actual
OpenRouter completions backed by approved internal credit. After two completions,
the second model's customer tariff changed; the two existing operation bindings
were unchanged before and after restart. A subsequent completion used the new
revision. All three attempt bindings matched their operation binding and their
independently calculated charges matched posted debits, with released holds and
no reconciliation discrepancy. This used internal prices, not a commercial offer.

A separate upgrade of the retained database containing two actual paid pool
completions backfilled exactly its two operation bindings. Each matched the
historical attempt revision; request details and customer CSV still reconciled
to the database and remained identical after restart. No new inference was sent
for that upgrade check. Both isolated environments stopped and original encrypted
identity checks were unchanged. Same-operation successor concurrency, a deliberate
conflicting-history migration and retry orchestration remain unverified.


## Operation funding-source binding foundation

Migration 0225 adds an immutable operation funding-source binding alongside the
retail-tariff binding. Personal-route admission pins `personal`; customer-tariff
admission pins `customer`. Both serialize on the operation row. A later binding
with the other source fails in the same transaction rather than switching who
funds the request. Existing personal/tariff bindings backfill exactly; conflicting
historical sources abort migration instead of selecting one. Charges, balances,
credential ownership and tariff revisions are not rewritten.

This protects the priced/personal boundary for future attempts. Unpriced shared
operations have no such binding and remain outside this failover foundation.
Safe append-attempt admission must require an existing funding binding, preserve
scope/model/key policy and independently validate every selected candidate. This
migration does not authorize retries, add an append API, or establish a safe
predecessor, attempt limit or overall deadline.


Current-input verification used a fresh isolated native environment: a real
personal OpenRouter completion pinned `personal`, and a real credit-backed
completion pinned `customer`. Independent database reads reconciled the latter's
reported tokens to its exact customer charge and debit. Every funding binding
and the charge survived gateway restart. An interrupted personal preparation left
no funding binding or partial operation, and a model-revision race still retained
an undispatched prepared attempt. Existing RPM/procurement denials were preserved.

A retained database containing two earlier actual paid-pool completions upgraded
to exactly two matching customer funding bindings. Its request details and CSV
still matched historical tokens and charges and were unchanged after restart,
without another inference or charge. Original encrypted identity was preserved
and both isolated environments stopped. These observations do not qualify a
mixed-source historical migration failure, concurrent successor admission, or
actual retry orchestration; those remain open.


## Bounded Chat successor implementation

Migration 0226 and the Chat handler connect the preceding foundations to a
versioned, two-attempt policy for canonical OpenRouter immediate authentication
rejection. The atomic personal/priced preparation paths share an explicit append
transaction, preserving operation scope/model/task/key identity and requiring
persisted nonexecution with released holds. The operation lock and unique chain
position/predecessor admit at most one successor. Funding and retail revision
bindings remain immutable; the new attempt independently binds its chosen route
and procurement terms. Deadline checks run again at dispatch. Current candidate,
key, budget and Guardrail policy applies to the successor.

Earlier foundation sections record historical delivery boundaries. The current
implemented behavior and qualification limits are in the
[upstream retry policy](../reference/upstream-retry-policy.md). This increment
supports Chat only, excludes the rejected credential from selection and never
resumes a chain on restart. It does not implement generic error retries, health
cooldowns, video resubmission or failover after streaming output begins.


## Credential cooldown

Migration 0234 adds a credential-local rolling failure window and cooldown
stored in PostgreSQL. Only a newly persisted, qualified canonical OpenRouter
text authentication refusal contributes. Three observations within 60 seconds
pause new selection for 60 seconds. Further qualifying failures from already
selected work may extend the deadline; success does not reset the rolling window.
Uncertain execution, transport failures and unqualified statuses never count.

The failure classification and cooldown update commit together. A credential
row lock serializes observations from concurrent gateways; duplicate persisted
classifications cannot extend the deadline. Existing attempts are not backfilled.
Pool eligibility uses a SQL exclusion, while direct personal and shared aliases
return an explicit `503 upstream_credential_cooldown`. An empty eligible pool
retains `503 route_pool_unavailable`. Selection does not probe upstream, and
expiry restores eligibility without changing the alias, grants or tariff.

Cooldown applies only to new selection. Pinned attempts and saved video recovery
keep their route. Credential rotation does not clear the cooldown. The read-only
platform API and SDK expose policy, deadline and current-window count without
credentials, endpoints or procurement prices. See the
[policy and actual verification](../reference/upstream-credential-cooldown.md).

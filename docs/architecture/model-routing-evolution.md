# Model routing: current constraints and required implementation

Status: evolving implementation design, 2026-10-10. The additive
[text route pool implementation](../reference/model-route-pools.md) now provides
candidate administration and pre-dispatch selection. Complete business failover
and paid pool qualification remain open.

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
| Separate customer models and supply mappings | Multiple credentials serve one customer alias without changing grants or tariffs | Additive text pools implemented; actual personal alias/grant behavior verified; paid tariff behavior open |
| Candidate administration | Revisioned membership, priority, weight, enabled state and scoped history | Implemented with actual configuration/history/concurrency evidence |
| Candidate selection | Eligible priority/weight selection, no disabled or foreign personal routes, defined no-route response | Implemented; actual priority/protocol/disabled-member selection, scope rejection and concurrent weighted traffic verified; long-run distribution open |
| Safe failover orchestration | Distinct attempts, bounded retries and deadlines, no uncertain resubmission | Not implemented for generic inference |
| Health and recovery | Defined cooldown and re-entry under concurrent gateways without a probe flood | Complete cross-adapter behavior unverified |
| Financial and performance qualification | Actual multi-candidate traffic reconciles reservations, charges and route attribution under contention | Unverified |

For delivery, verify current-input requests and independently inspect selected
route records, HTTP results, actual usage, reservations and ledger artifacts.
Include configuration changes during admission, revoked credentials, concurrent
selection, partial streams, restart and no eligible candidates. Fixture results
do not establish any row above. External merchant activation and coverage of
every possible upstream service are not prerequisites for internal capability.

See [managed route bindings](../reference/managed-route-bindings.md) for the
implemented first increment and the exact current-input verification boundary.

# New API backend comparison

Status: 2026-10-11. The reference is QuantumNous New API at commit
`1d4328e97417a043a161a0dd30a5b129be3ace49` and its current feature guide. No New
API source is imported. Niu keeps its own ledger, route identity, and product
boundary.

New API is a self-hosted gateway: OpenAI-compatible access, channels, weighted
routing, failover, quotas, and logs. The comparison below tracks implementation scope. It is not a claim that all
Niu business workflows, deployment modes or performance targets are qualified.

## Implemented backend interfaces

| New API capability | Niu backend |
| --- | --- |
| OpenAI Chat, Responses, embeddings, streaming | Served on `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings` |
| Channel endpoint, priority, weight, model mapping | Supplier credentials plus route pools. Priority then weight. The selected mapping and revisions are pinned on the attempt |
| Several upstream keys for one model | One credential per mapping. A pool selects among mappings. Each key keeps its own endpoint, offer, and audit trail |
| API key quota, expiry, model allowlist, IP allowlist | Workspace keys with spending caps, expiry, revocation, rotation, and IP policy. Caps survive secret rotation |
| Request and concurrency limits | Per-key RPM, estimated TPM, and concurrency, plus independent per-credential RPM, enforced in PostgreSQL across gateway processes. See [credential request limits](../reference/upstream-credential-request-limits.md) for actual verification and boundaries |
| Usage logs | Activity and request diagnostics for calls Niu handled. Unknown usage stays unknown |
| Top-up | Prepaid company balance with Stripe, EPay, and Zhifux integration adapters. Funding requires verified receipts; adapter availability does not claim live merchant onboarding or received cash |
| Model prices | Explicit integer nanounit tariffs and immutable revisions. A later edit does not reprice history |
| Credential health | Durable, credential-local cooldown after three qualified canonical OpenRouter text authentication refusals within 60 seconds. Automatic re-entry after 60 seconds; uncertain execution never counts. See [cooldown policy](../reference/upstream-credential-cooldown.md) |
| Channel test | Bounded upstream model-list check. It does not return credentials or treat a listed model as entitlement |

Niu also separates customer charges, Supplier earnings, and upstream cost.
Customer APIs never receive Supplier prices. Company, workspace, and key limits
apply together. Guardrails and video jobs pinned to their original route are
outside New API's core channel model.

## Do not copy

These are Niu product and accounting choices, not blanket quality rankings of
another implementation.

| New API feature | Niu decision |
| --- | --- |
| Group ratio multiplied into a global model price | Reject. Customer prices are explicit tariffs. A ratio can hide the charged amount |
| Parameter override | Reject. Niu does not silently replace model, reasoning, or billing inputs |
| Subscriptions, redemption codes, check-in, invitation rewards | Reject. Prepaid balance and installation funding are the spending mechanism. Quota trading is out of scope |
| In-memory or single-node rate buckets | Reject as the authority. Limits that affect dispatch are durable and shared by every gateway |
| Task plugins, drawing, and music as gateway-owned work | Reject. Video jobs are model operations. External clients own other task systems |
| Auto-disable on any error, including an uncertain timeout | Reject. A timeout is not proof the provider did no work and must not by itself burn the credential |

## Backend implementation and qualification gaps

The following capabilities have different implementation and verification states.
An implemented subset does not close its tracking issue; missing external
commercial activation is distinct from an unfinished integration capability.

| Gap | Required Niu behavior | Tracking |
| --- | --- | --- |
| Automatic failover | A later eligible mapping only after the previous attempt is proven not executed. No second submission after uncertainty or a committed stream | [#8](https://github.com/niu-io/niu/issues/8) |
| Claude Messages and Gemini GenerateContent | Native nonstreaming Messages and static/managed Gemini GenerateContent text handlers are implemented with explicit capability checks; Gemini success/settlement and native streaming/tools/media remain open. See [protocol boundary](native-inference-protocols.md) | [#16](https://github.com/niu-io/niu/issues/16) |
| Tiered and category prices | Customer and Supplier [whole-request context tiers](context-tier-pricing.md), [reasoning rates](../reference/reasoning-output-pricing.md) and [cache-write rates](../reference/customer-cache-write-pricing.md) are implemented. Customer current-input evidence covers tier boundaries, cache categories, pinned revisions, bounded admission and exports. Actual nonstreaming and streaming customer calls now cover simultaneous nonzero cache-write/reasoning charging and restart. Correction of previously missing category usage remains unverified. Supplier publication/history is exercised; nonempty category/tier earnings, recovery and settlement remain unverified. | [#17](https://github.com/niu-io/niu/issues/17) |

Priced text admission now saves its attempt, immutable bindings and reservation
in one transaction; [atomic admission](../reference/priced-admission-atomicity.md)
and [financial recovery](../reference/financial-backlog-restart-live.md) describe
actual verification and remaining limits. Do not infer full completion of
[#7](https://github.com/niu-io/niu/issues/7) from that implementation alone.

Chat pools implement a bounded, canonical OpenRouter authentication-rejection
successor policy. Its [retry contract](../reference/upstream-retry-policy.md)
requires durable nonexecution evidence and rechecks admission for the successor.
Credential cooldown is separately implemented under the narrow policy above.
Generic failover and broad commercial supply qualification remain open under #8.

Per-credential request caps are implemented under
[#15](https://github.com/niu-io/niu/issues/15). Current-input native execution and
independent reopened PostgreSQL inspection cover cross-gateway contention,
rolling-window expiry, restart, customer-key independence and personal/shared
separation. A configured Niu cap is not a measurement of the upstream account's
remaining quota. Personal self-funded calls and configured internal verification
rates do not establish discounted commercial supply. Fixture outcomes are not
readiness evidence.

## Issue acceptance boundaries

- [Prepaid invoice statements (#11)](https://github.com/niu-io/niu/issues/11):
  [actual invoice history](../reference/customer-invoice-history.md) records
  posted customer debits, paid statement totals, pagination, restart and scope
  checks. This is backend evidence. The issue also requires matching workspace
  and global Settings browser behavior, which is not established by those API
  and database runs.
- [Category/tier prices (#17)](https://github.com/niu-io/niu/issues/17):
  cache-read plus reasoning and cache-write plus reasoning have actual combined
  charge evidence for nonstreaming and streaming calls, including restart.
  Interrupted streams and later upstream usage corrections remain separate gaps. The
  [actual tier failover run](../reference/upstream-retry-policy.md#context-tier-pricing-across-an-actual-successor)
  confirms operation-level price pinning across an in-flight tier edit, not
  every category combination or commercial Supplier settlement.
- [Safe failover (#8)](https://github.com/niu-io/niu/issues/8): the implemented
  authentication-refusal policy and credential cooldown do not establish
  generic failover. Unknown execution and an already returned stream still
  prohibit another submitted attempt.

Keep these issues open until their own remaining acceptance work is supported.
Do not use fixture outcomes, compilation or an empty successful API response to
replace missing business or browser evidence.

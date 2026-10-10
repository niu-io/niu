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

## Backend gaps to close

These are the New API backend behaviors Niu does not yet provide. The
replacement has to be stricter than the reference, not a port.

| Gap | Required Niu behavior | Tracking |
| --- | --- | --- |
| Automatic failover | A later eligible mapping only after the previous attempt is proven not executed. No second submission after uncertainty or a committed stream | [#8](https://github.com/niu-io/niu/issues/8) |
| Claude Messages and Gemini GenerateContent | Public protocol endpoints with declared capability checks. Unsupported fields fail before dispatch | [#16](https://github.com/niu-io/niu/issues/16) |
| Tiered and category prices | Cache-write, reasoning output, and long-context tiers as explicit pinned rates. No double count of tokens already in another category | [#17](https://github.com/niu-io/niu/issues/17) |

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

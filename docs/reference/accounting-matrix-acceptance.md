# Accounting matrix acceptance evidence

This consolidates the existing actual-request evidence for S05-2: exact category/tier/fee charging, insufficient capacity, concurrent liability, uncertainty and recovery. On 2026-10-12, twelve bounded evidence slices were independently inspected again by parsing retained upstream responses and reopening their stopped native PostgreSQL databases. No new inference was requested for this consolidation. Fixture results are not evidence.

These are historical actual executions, not twelve fresh runs of the latest executable. The table states precisely what their final artifacts establish. The currently declared charging matrix is covered through finite supported slices; no requirement for every mathematical cross-product is implied.

## Verified slices

| Slice | Supported behavior | Independent artifact and native-state result | Boundary |
| --- | --- | --- | --- |
| Cached input with additive fee and minimum | Reported cached input is subtracted from ordinary input, priced separately, then the fixed fee and minimum are applied. | Three raw response digests and usage match the pinned tariff revisions. Recomputed total is 11,971,111 nanounits; exact charges, debits, invoice total and exercised refund balance match; no open customer hold. | Does not demonstrate all token categories simultaneously. [Fee record](text-request-fees.md). |
| Cache-write two-Gateway liability | A separately priced write category cannot bypass reservation as a nominally free ordinary-token request. | Saved actual response reports 5,277 write tokens; one attempt, one exact charge/debit, observed overlap and no remaining hold. | Bounded competing admission, not saturation. [Cache-write record](customer-cache-write-pricing.md). |
| Reasoning concurrent liability | Explicit reasoning liability is reserved against shared company capacity. | Saved actual response and native state establish one admitted request, one 10,000,000-nanounit charge/debit and no remaining hold. | Scope is the exercised competing requests and tariff. [Reasoning record](reasoning-output-pricing.md). |
| Missing-category persistence recovery | A real upstream reasoning response survives an independently injected persistence omission, rejects conflicting supplementation and settles using its original tariff. | Original raw response and canonical receipt retain nonzero reasoning. Conflict is 409; final state has one exact debit and no remaining holds despite later tariff editing. | **Controlled persistence fault**, not naturally missing upstream reasoning. [Recovery record](completion-replay.md). |
| Hard process termination with fixed fee | Partial output without terminal usage remains uncertain; an additive fee does not turn unknown usage into a completed charge. | Saved real SSE prefix has content but no DONE or usage. Native state retains one unknown attempt and a 1,000,000-nanounit hold, with zero charge/debit and no alternate dispatch. | Deliberate process termination; retained uncertainty is the correct outcome, not completed recovery. [Fee record](text-request-fees.md). |
| Native Messages and Chat tier recovery | Real missing billable totals can be supplemented from canonical metadata for the same completed generation, selecting its original tier. | Native Messages stream, actual Chat response and receipt match quantities; two charges total 1,090 nanounits, one reconciliation, no extra attempts, no open holds or funding. | Genuine upstream/adapter missing-usage state, distinct from controlled persistence faults. [Tier record](../architecture/context-tier-pricing.md#native-messages-recovery-and-shared-historical-invoice--2026-10-12). |
| Cache write/read context tiers | Whole-input threshold includes ordinary, read and write quantities; the selected complete schedule is immutable. | Two raw responses demonstrate nonzero write and nonzero read respectively. Native quantities, selected threshold 1,000, exact charges/debits and two historical invoice lines match; later clearing does not rewrite them; no held reservation. | Does not infer missing category quantities. [Tier record](../architecture/context-tier-pricing.md). |
| Context-tier two-Gateway liability | Shared company capacity reserves the qualified tier liability across Gateway instances. | Actual response and native state establish one attempt and one exact 5,276-nanounit charge/debit with no remaining hold. | Bounded concurrency, not a production throughput qualification. [Tier record](../architecture/context-tier-pricing.md). |
| Fixed-only fee contention | A fixed-only tariff is charged and reserved even when token rates are zero. | Actual run had two Gateway instances and statuses 200/402. Reopened state has one dispatched attempt, one 1,000,000-nanounit charge/debit, no open hold and no funding receipt. | Capacity refusal is pre-dispatch for the losing request. [Fee record](text-request-fees.md). |
| Genuine missing reasoning category | Known aggregate totals do not prove separately billed reasoning quantity. | Actual upstream response and native aggregate counts match; pinned reasoning rate is retained; category is absent, charges/debits remain zero and one customer hold remains. | Positive recovery needs trustworthy quantity evidence; none is invented. [Reasoning record](reasoning-output-pricing.md#missing-reasoning-quantity). |
| Recorded versus uncertain upstream refusal | Persisted nonexecution and unrecorded uncertain execution have different financial outcomes. | Retained actual HTTP 401 response and reopened state distinguish released nonexecution from retained uncertainty; current request-detail/report/CSV projections preserve null charge/usage and do not alter financial entries. | Unknown does not mean zero; this does not grant automatic fallback after possible execution. [Failure record](customer-charge-reconciliation.md). |
| Context-tier successor retry | A successful successor uses its own pinned tier; rejected predecessors do not acquire its charge. | Retained raw responses and native state preserve one tariff revision per operation, threshold one, exact usage-based debits only for successful successors and no open holds. | Does not authorize retry after uncertain partial execution. [Tier record](../architecture/context-tier-pricing.md). |

## Source and runtime provenance

The Messages/Chat recovery artifact retains full native runtime commit `268c25d5f07cae8766d229f8ba961aef481880a8`; its independent reader checks the saved executable SHA-256. The recorded-refusal artifact retains runtime `ca4e5a993117087b271ca1503fb9903ef9025464`, with later projection verification described in its linked records. Several older slice artifacts do not retain a full digest-verified executable pin. Their raw response and database consistency checks remain scoped historical evidence; their executable identity is unverified by this consolidation.

A source comparison from `268c25d` to consolidation baseline `5591a02dd70d7655e557dfb8273e535828ba7362` found no changes in `crates/metered-cost`, `crates/storage/src/customer*` or `crates/storage/src/token*`. This establishes continuity only for those accounting source paths. It is not proof that every adapter, Gateway admission path, recovery worker or database migration is unchanged, and does not promote older slices to latest-runtime end-to-end evidence.

## Exactly-once and remaining bounds

Independent charge/debit cardinality and released-hold checks establish the final ledger for each listed scenario. They do not, by themselves, establish every duplicate race. Actual repeated supplementation, replay and restart scopes are described in [completion replay](completion-replay.md); customer refunds and invoice preservation retain their separately exercised scopes. Unknown usage retains liability rather than an invented zero charge. Genuine missing upstream quantities and injected persistence omissions are separate cases.

No retained slice here demonstrates one response with simultaneous nonzero cache read, cache write, reasoning, a context tier and a fixed fee. That combined behavior is unverified. Supplier earning/settlement and paid customer media belong to S05-3; actual received cash and payment callbacks belong to S06-3. This consolidation neither fabricates those outcomes nor makes external account activation a prerequisite for implemented backend capability.

## Current Messages uncertainty and exactly-once supplement

The [current protocol run](inference-protocol-acceptance-matrix.md) independently
qualifies the missing-aggregate to canonical-receipt recovery at pinned native
`1212ea3b`, schema 284. Two actual Messages generations initially retain unknown
usage and one priced hold each. Reconciliation and identical replay obtain the
original canonical generation metrics; final native records have one charge,
one debit and one receipt per attempt, no open holds and unchanged other rows.
Missing cache-write quantity remains null. This adds current recovery evidence;
it does not replace the separate fee/tier/concurrency slices or promote their
missing executable identities to verified current-runtime tests.

## Bounded consolidation against the retained 8bf checkpoint — 2026-10-13

The fixed S05-2 criterion remains:

> Consolidate exact category/tier/fee, insufficient-capacity, concurrent liability, uncertainty and exactly-once recovery checks for the supported charging matrix.

Nine retained actual-execution slices were independently reopened again in
native PostgreSQL, using read-only SQL and stopped copies. Their raw response
artifacts and original final ledger records were checked directly. No new
inference, merchant query, tariff, funding or upstream receipt was created.
This is renewed verification of historical final artifacts, not fresh execution
of all scenarios on Gateway `8bfdef10003eebe9402401247aa52cd69d3a398f`.

| Fixed criterion | Independently rechecked actual scope | Result and limit |
| --- | --- | --- |
| Exact categories, additive fee and minimum | Actual nonzero cached-input responses, frozen revisions, invoice/refund ledger; separately nonzero cache-write and reasoning responses | Cached fee/minimum charges total 11,971,111 nanounits; write and reasoning charges/debits match their reported category quantities. Missing reasoning remains absent with a priced hold, rather than inferred zero. |
| Context tier and fee | Below-tier native `f6967dadae7effff19227a4e56c586a07fc7eaea`; positive above-tier native `4a2f956cbad72eda0a240ef627b9d04f259036a9` | Below-tier 21,234 and above-tier 79,506 nanounits match upward-rounded frozen rates plus the 12,345 fee. Above-tier threshold is 64; one charge/debit and no open hold. Response digests, executable hashes, original financial/configuration fingerprints and customer CSV match. |
| Insufficient capacity and concurrent liability | Fixed-only fee, cache-write and reasoning competing admissions across two Gateways | Fixed-only actual statuses 200/402 preserve exactly one dispatched attempt and one 1,000,000 charge/debit. Category-liability slices preserve one admitted attempt and exact debit with no open hold. These are bounded contention checks, not throughput or saturation claims. |
| Uncertain execution | Actual connection timeout and real SSE interrupted by deliberate process termination | Timeout remains zero charge/debit with priced liability. Interrupted real output has no terminal usage/DONE, zero charge/debit, one 1,000,000 hold and no alternate dispatch. Controlled termination is identified explicitly. |
| Exactly-once recovery | Two actual Messages generations, original unknown state, canonical metrics, recorded reconciliation and identical replay | Original tariff and quantities produce exactly one charge/debit/receipt per attempt, no open hold and unchanged other rows. Missing cache-write remains null. Customer details, CSV and summary match native final records. No generation is repeated during this consolidation. |

The accounting source paths `crates/metered-cost`,
`crates/storage/src/customer*` and `crates/storage/src/token*` are byte-for-byte
unchanged from the documented `5591a02d` baseline, Messages `1212ea3b` and
above-tier `4a2f956c` checkpoints to retained `8bfdef10`. This continuity is
limited to those source paths. It does not establish unchanged Gateway
admission, adapter transport, migrations or every recovery caller. Older slices
without a digest-verified executable retain that stated provenance limitation.
All databases opened for this independent verification were stopped afterward.

The finite supported accounting mechanisms have evidence in the mapped slices;
no newly discovered missing accounting mechanism requires a code change from
this consolidation. The fixed criterion does not add a requirement for one
response to combine every independently priced category, tier and fee. That
simultaneous cross-product remains unverified and is not promoted to an observed
success. Current-runtime end-to-end reruns of all historical contention slices
also remain unverified. Supplier/media accounting and received-cash funding
retain their separate S05-3/S06-3 scopes. Fixture outcomes contribute no evidence,
and task status remains owned by the release checkpoint.

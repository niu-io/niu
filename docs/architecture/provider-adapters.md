# Provider service adapters

Decision date: 2026-11-02. Feature scope: 0.3.0. Execution is tracked in `niu-9ju` and its dependent work; this document defines the architecture rather than a parallel task list.

## Responsibility boundary

`apps/gateway/src/providers/adapters/` contains Provider-specific implementation code. The service registry includes OpenRouter, FastRouter, BabelArk, Qiniu and official DeepSeek. A shared interface exposes service descriptors, model metadata normalization and price evidence. This is distinct from inference protocol adapters: using OpenAI-compatible JSON establishes no currency, price unit, discount or account entitlement.

Provider business configuration owns explicit service identity; individual credentials inherit it unless an existing compatibility override is deliberately saved. Neither the hostname nor the model developer chooses the pricing adapter. Historical configuration is not backfilled by guessing from URLs. Native identities extend the existing revision-checked integration contract and preserve its legacy New API, LiteLLM and custom values.

The dashboard's branded connection entry points, REST/SDK, MCP and coding-agent integrations must consume the same backend discovery contract. Presentation assets may remain bundled with the frontend; monetary parsing and price-source behavior do not belong there.

## Metadata and price evidence

A metadata read normalizes declared model names, context/output limits, modalities and supported parameters. Missing declarations stay unknown. Catalog visibility does not prove successful inference or account entitlement. Explicit model import persists private internal-use mappings idempotently; it does not create a selling tariff or commercial inventory.

A price result retains its normalization version, a digest of the fetched source, applicable conditions and native group/rule evidence. It has an observation timestamp only when a source was actually read, a source URL, evidence basis, availability state, monetary rates with explicit units/currency, unsupported dimensions, and separately typed native ratios. Preserve decimal values exactly; do not round through binary floating point or convert an unknown unit to money. An explicit zero quote differs from absent price evidence.

OpenRouter advertises USD per-token/request dimensions in its documented model response. New API-style ratio sources require Provider-specific monetary basis and effective-group qualification. Qiniu's rounded aggregate standard-price bills do not establish exact unit prices or final discounted expenses. DeepSeek's official pricing distinguishes cache and time windows. These cases belong to their Provider implementations, not a universal OpenAI parser. See [the source audit](../reference/provider-price-discovery.md).

Native ratios and an unqualified or changed official-page schema must never be labeled a ready monetary estimate. Return partial/unavailable evidence with a reason. A source schema change, empty inventory, unknown currency, unsupported dimension or rate plan is recoverable missing information, not a free model.

## Retrieval and authority

Reads are bounded by time and response size and reuse the gateway's endpoint safety controls. Public/console quote retrieval never forwards a saved inference credential to a different API surface. Metadata reads using a key retain current credential-scope authentication and response validation. Source failures are sanitized and do not erase saved keys, mappings, previous quote evidence or existing tariffs.

Prepared-service discovery and Provider price inspection currently require platform administration. This does not implement end-user BYOK, tenant reseller administration or a public procurement API. Advertised public quotes, effective account rates, agreed Provider purchase rates and Niu customer selling tariffs remain distinct. Preserve ownership and serialization checks when exposing account-specific evidence.

## Durable estimates and refresh

Advertised quote versions must be immutable when used for a historical estimate. Persist the Provider/adapter identity, source/normalization version, time, units, currency, coverage and applicable conditions. A later refresh must not rewrite previous request estimates or posted customer charges. Provider-reported expenses remain separate evidence and must not be added to an estimate as if they were another charge.

Refresh should be explicit or bounded and scheduled, revision checked against the saved service identity, and recoverable after uncertainty. Cached source results are disposable; historical product evidence is backend-owned. Manual overrides and centrally maintained official-source catalogs must retain their own provenance and precedence. Avoid requiring each installation to enter every model's price, but do not claim an unqualified price feed is supported.

## Deployment policy

`NIU_OPERATING_MODE` is immutable for a running process. Missing/empty/`internal` selects internal use; only `resale` selects commercial operation. There is no dashboard switch. Hosted Cloud explicitly deploys `resale`; workspace administration is not platform administration. Existing shared/static routes must not become free when deployment configuration changes. Live/test payment configuration is an independent setting, and end-user BYOK is a separate future capability.

## Current management contract

All endpoints below require platform administration. They expose procurement evidence only to that scope; workspace administrators and Provider membership alone do not authorize access.

- `GET /api/v1/providers/presets` lists supported service descriptors without creating inventory or contacting an upstream.
- `GET /api/v1/providers/{provider}/metadata?credential={credential}` reads the selected connection's bounded model catalog after checking Provider ownership.
- `GET /api/v1/providers/{provider}/pricing` discovers current advertised evidence using the explicitly saved Provider integration.
- `POST /api/v1/providers/{provider}/pricing` captures an immutable version only while the saved integration identity and revision still match.
- `GET /api/v1/providers/{provider}/pricing/history` lists captured versions. After an uncertain capture response, inspect history before retrying.
- `GET /api/v1/providers/{provider}/pricing/{revision}` reads the original captured evidence without refetching.
- `POST /api/v1/providers/{provider}/estimate` accepts a captured revision, upstream model ID and disjoint billable meter quantities. It returns exact decimal totals by currency, unknown meters and coverage; it performs no inference or ledger mutation.

The first implementation normalizes OpenRouter's supported monetary dimensions. BabelArk preserves native ratios without converting an unqualified currency/group basis into money. FastRouter's anonymous empty inventory remains unavailable. DeepSeek validates its official Markdown table, preserving cache and explicit peak/off-peak conditions. Qiniu validates the official model square's SSR JSON, normalizing qualified CNY token rates and retaining complex native pricing rules without selecting them. These states do not block saving a connection or importing model metadata. They do block claiming a complete monetary estimate. No scheduled refresh, authenticated console scraping, automatic customer tariff publication or Provider invoice reconciliation is implied.

Conditional estimates require a matching condition from the captured quote. An omitted or ambiguous condition yields unknown coverage, and the estimator never selects the first matching rate arbitrarily. DeepSeek holiday/time qualification is explicit; Niu does not infer Chinese public holidays from a clock. Search/Fetch charges are separate unsupported dimensions. Qiniu tiers, time windows and media variants remain in `source_rules`; only a validated generic single-rule token schedule is normalized. Group qualification and actual upstream invoice reconciliation remain distinct contracts.

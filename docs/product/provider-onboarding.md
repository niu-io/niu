# Provider onboarding and direct upstream payment

Decision date: 2026-11-01. Implementation tracking: `niu-5sx`.

## Mode terminology

Use **Internal use** / **自用模式** and **Resale** / **转售模式**. The distinction is whether Niu charges downstream customers, not who enters an upstream API key. Administrators may supply the same kind of upstream credential in either mode. Internal use covers an individual or authorized internal team: the owning account funds upstream execution, while Niu manages routing and usage/cost evidence without downstream tariffs, collection or settlement. Resale additionally requires commercial supply, customer pricing and billing. BYOK describes a credential-supply arrangement and is not the mode name. Passthrough describes forwarding behavior and is also not the mode name. Neither mode bypasses authorization or rewrites historical funding attribution.

**End-user BYOK is a separate future capability and is not implemented by this work.** It would allow a platform's downstream users to add and manage their own upstream credentials under a dedicated authorization, ownership, quota and cost-visibility contract. Current preset connections remain platform-administrator operations. Internal use does not imply end-user credential self-service. Do not expose this future capability in installation or marketing as available.

New API documents a self-use mode as an alternative to configuring model prices (https://doc.newapi.pro/support/faq/). Niu preserves its own explicit account-ownership boundary rather than treating an installation-wide switch as authority to share private keys or rewrite historical billing.

## Deployment policy

`NIU_OPERATING_MODE` is a deployment environment variable, not a mutable dashboard setting. Missing, empty or `internal` selects Internal use; only `resale` enables Resale. Other values fail startup. Niu Cloud production and release staging explicitly set `resale`; customer workspace administration never grants platform administration or reseller authority. Tenant-operated resale and end-user BYOK require separate future authorization and accounting designs.

Internal use does not require payment collection and can serve authorized internal workspaces. Existing shared/static commercial routes cannot silently become free when the variable changes: Internal use refuses that incompatible startup configuration. Historical ownership, attempts, tariffs and invoices remain unchanged. Coordinate any deliberate migration outside this setting and keep all replicas consistent. Live/test payment configuration is an independent axis; mock receipts do not select an operating policy.

## Default experience

Niu's default connection experience is Internal use. A platform administrator or an appropriately authorized coding agent chooses a supported Provider and supplies a private API key. Niu discovers and imports available models where the integration supports it; discovery failures require a clear retry or recovery path. Model pools are optional configuration for specific scenarios. The account pays the upstream Provider directly and maintains the upstream balance, subscription, credentials, and access rights. Niu does not require customer selling prices, collection, prepaid credit, commercial qualification, or settlement configuration for this path.

Niu supplies routing, model-management controls, usage and performance evidence, and clearly attributed cost information. It does not guarantee an upstream service's continued validity or that the resulting configuration offers the best value.

## Administrator-managed Provider presets

Provider management must include a prepared directory even when no connections have been saved. The initial required entries are **OpenRouter**, **FastRouter**, **BabelArk**, **Qiniu**, and official **DeepSeek**. Retain custom Provider setup and make the directory extensible without changing the connection workflow. This directory is a separate deliverable from the default Internal use funding and cost-accounting changes.

Present common supported services as connection presets even when no connection has been saved. Presets are configuration instructions, not saved Provider businesses, credentials, available inventory, or commercial offers. Browsing or cancelling a preset must not create records.

Each preset identifies the supported adapter, canonical endpoint, relevant region or service variant, and an official credential-management destination. Prefer a key-first form with these values prefilled. Keep custom endpoints and advanced configuration available. Do not imply that API compatibility establishes full feature support, model entitlement, successful inference, or catalog availability.

Saving creates the credential and its explicit funding ownership together. A failed or uncertain write must not leave an apparently shared credential behind or invite blind retries. Preserve existing records and stable references; presets must not generate duplicate business records on startup or overwrite user configuration.

The platform-administrator authorization boundary remains in force. End-user BYOK requires a separate future self-service authorization contract. Presets do not grant ordinary accounts platform administration. Private funding ownership and Provider business identity are separate relationships.

## Activation and recovery

Distinguish credential saved, upstream authentication/catalog discovery, selected model routes, pool readiness, and actual inference verification. A saved key alone does not make a model usable. The explicit “Connect and import models” action imports the bounded catalog as private owner-funded mappings. This does not publish a public catalog, grant access to unrelated accounts or keys, configure resale, or initiate paid inference. Existing disabled routes and user edits survive repeated imports.

Default readiness should explain the next connection or model action. Commercial approval and offer readiness belong to the optional commercial workflow, not the primary Internal use status. Missing or expired credentials, depleted balances, missing model entitlement, catalog failures and unavailable prices need distinct, recoverable states where evidence permits. Otherwise state that the upstream cause is unknown.

Allow people and agents to revisit, replace or disable a key without losing historical requests or their original ownership and cost attribution. Keep secrets write-only and out of URLs, logs, browser persistence and evidence artifacts.

## Cost evidence

Track usage and Provider-based cost without charging the customer's Niu balance for owner-funded calls. Do not create customer tariffs, settlement liabilities, cash receipts or commercial revenue from this evidence.

A Provider catalog quote is an advertised price, not an invoice. Record its source, currency, billing units and observation time. Where usable quantities and a matching quote exist, retain the price snapshot associated with the request and label the result as an estimate. Handle cached input, output, reasoning and other billed units according to that Provider's documented semantics. Unsupported or unpriced units leave coverage incomplete; missing prices are unknown rather than zero.

A Provider-reported cost may be presented as reported cost only when the evidence identifies its scope and currency. Do not label an estimate as an actual charge, silently replace historical snapshots when prices change, mix currencies into one total, or treat incomplete subtotals as full coverage. Keep estimated and reported amounts separate to prevent double counting retries or attempts.

An account may inspect its own owner-funded usage and expense evidence. This does not authorize access to platform procurement, other accounts' costs, Provider agreements or margins. Enforce ownership and serialization boundaries on the backend, including exports and agent APIs.

## Optional commercial operation

Commercial resale remains a separate workflow. An authorized platform administrator must enable an offer at its current agreed purchase rates; a connected key alone does not authorize resale or prove upstream access. Customer prices, workspace authorization, collection and settlement remain separate. Historical qualification reviews retain their original meaning and expiry. Do not migrate existing shared routes, invoices, prices or historical accounting into the default Internal use mode.

## Observed implementation boundary

The 2026-11-01 implementation adds the prepared directory, key-first setup with atomic personal ownership, explicit idempotent private model import, and Internal use service eligibility without payment setup. Existing shared-creation defaults and commercial accounting remain compatible. This does not establish an actual upstream invoice or implement historical Provider-cost estimation. Staging deployment and live credentials remain separate acceptance evidence.

Acceptance requires a fresh account with no configured Providers, preset selection and cancellation, ownership-safe save and uncertain-write recovery, model selection and pool use without resale setup, account isolation, usage/cost provenance, and unchanged commercial behavior. Inspect the actual desktop and narrow workflows and verify agent readback contracts before declaring this journey delivered.

Price-source evidence and unverified adapters are documented in [Provider price discovery](../reference/provider-price-discovery.md).

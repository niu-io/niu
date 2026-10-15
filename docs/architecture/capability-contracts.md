# Capability and adapter contracts

Status: the unified Rust Plugin API (`niu.plugin.v1`, backward-compatible with `niu.extension.v1`) is implemented in `crates/plugin-api` alongside the service helper runtime in `crates/plugin-sdk`. Built-in open-source plugins in `plugins/hello-echo`, `plugins/request-tagger`, and `plugins/webhook-audit`, together with the synthetic reference fixture in `tests/extensions/reference-extension`, implement and exercise each capability.

## Role in the unified Plugin architecture

These typed traits define the **data-plane hooks (`hooks`)** and **asynchronous event observers (`observers`)** facets of Niu's unified **Plugin** model (see [Plugin composition, Cloud SaaS, and Enterprise distributions](enterprise-composition.md) and [repository ownership](repository-ownership.md)):

- **Public open-source plugins (`niu-io/niu/plugins/*`):** Built against `crates/plugin-api` and `crates/plugin-sdk` inside this repository (`hello-echo`, `request-tagger`, `webhook-audit`) so community deployments can enable standard integrations directly when starting Niu, and so public CI continuously exercises the Plugin Host boundary.
- **Private commercial and enterprise plugins (`niu-io/plugins`):** Built against the same public `crates/plugin-api` and `crates/plugin-sdk` contracts to provide monetized capabilities (such as `sso-scim`, `governance`, `compliance`, `commercial`, `supply-intelligence`, `proprietary-providers`, and `license`) assembled into the `niu-io/cloud` (`niu.io` SaaS) and `niu-io/enterprise` (self-hosted Enterprise) distributions.

## Product scope

The [current product focus](../product/product-focus.md) limits Niu to model access and consumption observability. Existing task traits (`TaskAdapter`) and synthetic fixtures remain compatibility artifacts; implementing a task runner or sandbox is not a Niu release requirement. External clients own task execution and acceptance. The historical R13 reference belongs to the [legacy release plan](../releases/first-release-legacy.md), not the current acceptance matrix.

## Protocol fidelity

The gateway currently implements one OpenAI-compatible text embedding operation. A model route must explicitly declare embedding support; dimensions and base64 encoding each require their own declaration. These declarations are operator-provided and do not prove upstream conformance. The gateway rejects unsupported providers and capabilities before creating a durable operation or attempt. Native Anthropic and Bedrock embeddings, token-ID and multimodal inputs, and provider conformance suites remain unimplemented.

Represent each protocol operation and its supported capabilities explicitly. The v1 provider contract declares protocol, streaming, tools, structured output, modality and usage support. It has separate non-streaming normalization and SSE-frame normalization types for text, tool arguments, structured JSON, usage, completion and failure. Core validators reject requests outside an adapter's declared capability set and reject normalized stream events after a terminal event in a frame. `ProviderStreamValidator` also remembers terminal state across frames; the host must use one per response and require a terminal event before accepting a cleanly completed stream.

The current v1 shape does not yet define a general transformation-loss report or strict conversion mode. Provider adapters encode and decode provider protocols; they do not own tenant authorization, budget settlement, credential resolution or retry scheduling. Core transport validation constrains relative paths, rejects path traversal and credential-shaped headers/query keys, and reserves host and authentication headers to the core.

## One request coordinator

This is the required runtime design; it is not yet wired into the gateway. The gateway must own authentication, eligible-provider selection, policy invocation, durable admission, attempt counts, deadline, retry decisions, output commitment, and settlement. There must be one owner for retry decisions. Provider SDKs and adapters must not add hidden retries, hedging, or cross-model fallback.

Each decision includes a stable reason code and binds to the request, attempt, tenant, policy revision, offer revision, and configuration generation. A retry repeats authorization, eligibility, required policy, and financial admission.

## Provider compatibility evidence

An approved provider offer has an immutable revision and a report covering request transformations, SSE frame boundaries, UTF-8 splits, tool argument fragments, provider errors, usage, cancellation, timeouts, and terminal events. Self-reported capabilities and active conformance observations are stored separately.

Unknown capabilities are unavailable for hard requirements. Changed endpoints, credentials, regions, model mappings, rates, or privacy conditions create a new revision and invalidate affected approval evidence.

## Plugin hook and observer boundary

The v1 API has typed identity-claim (`IdentityFederation`), policy (`PolicyHook`), provider (`ProviderAdapter`), route-selection (`RouteSelector`), and metering-observer (`MeteringObserver`) traits (plus legacy `TaskAdapter`). Context is created by the core after authentication and includes tenant/principal IDs, request identity, deadline, cancellation and idempotency key. A policy receives no content unless the caller explicitly supplies it. Each policy evaluation carries a core-owned policy ID and revision, request/response stage, SHA-256 digest of the protocol, model alias and supplied content, required/optional flag, and expiry. The plugin must echo that binding exactly; stale, changed-input, or mismatched results fail validation. Redaction pointers must resolve against the supplied content and are applied atomically to a copy, with overlapping or unavailable targets rejected. A required hook always blocks on failure. An optional hook may allow with an explicit failure signal only when its policy-only manifest is configured fail-open. Identity output cannot change the issuer or subject, verify an unverified email, or raise assurance above the input. Route selection can only reorder eligible candidate IDs; the core rechecks grants, health, limits, policy and reservation. Metering observers receive immutable events and acknowledge the stable event ID; hosts that retry delivery must deduplicate on that ID. The acknowledgement cannot change the authoritative ledger event.

The policy contract binds an evaluation to a supplied revision but does not yet provide a durable policy catalog, persisted decision audit, or gateway hook orchestration. It defines request and response stages only; safe streaming inspection and buffering remain open. Metering receipts define identity for deduplication; a durable host outbox and Unix-socket delivery worker are scheduled for the post-refactor Plugin Host implementation. The identity trait currently maps already authenticated claims; OIDC/SAML handshakes, signature validation, provisioning, and session creation are paired with plugin HTTP routes. Runtime hook registration, policy ordering, hook timeouts/fallback execution, and provider conformance remain scheduled after the core API refactor. Do not load untrusted code in-process. Browser clients cannot call private plugin sockets directly.

The executable contract check is `cargo test --locked -p niu-reference-extension`. It proves API use and core-side validation behavior; it does not prove gateway integration or close release acceptance row R13.

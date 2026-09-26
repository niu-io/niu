# Capability and adapter contracts

Status: the versioned Rust API `niu.extension.v1` is implemented in
`crates/extension-api`. A synthetic public extension in
`tests/extensions/reference-extension` implements and tests each capability.
The gateway does not load or invoke extensions yet, so none of these traits is
available as a configured runtime integration. The reference extension uses
synthetic inputs and does not contact an identity provider, model provider, or
task runner.

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

## Extension boundary

The v1 API has typed identity-claim, policy, provider, task, route-selection and metering-observer traits. Context is created by the core after authentication and includes tenant/principal IDs, request identity, deadline, cancellation and idempotency key. A policy receives no content unless the caller explicitly supplies it. Each policy evaluation carries a core-owned policy ID and revision, request/response stage, SHA-256 digest of the protocol, model alias and supplied content, required/optional flag, and expiry. The extension must echo that binding exactly; stale, changed-input, or mismatched results fail validation. Redaction pointers must resolve against the supplied content and are applied atomically to a copy, with overlapping or unavailable targets rejected. A required hook always blocks on failure. An optional hook may allow with an explicit failure signal only when its policy-only manifest is configured fail-open. Identity output cannot change the issuer or subject, verify an unverified email, or raise assurance above the input. Route selection can only reorder eligible candidate IDs; the core rechecks grants, health, limits, policy and reservation. Task output is validated against the public execution schema and input task ID. Metering observers receive immutable events and acknowledge the stable event ID; hosts that retry delivery must deduplicate on that ID. The acknowledgement cannot change the authoritative ledger event.

The policy contract binds an evaluation to a supplied revision but does not provide a durable policy catalog, persisted decision audit, or gateway hook orchestration. It defines request and response stages only; safe streaming inspection and buffering remain open. Metering receipts define identity for deduplication but do not provide a durable host outbox, retry worker or delivery guarantee. The identity trait currently maps already authenticated claims; it does not define OIDC/SAML handshakes, signature validation, provisioning or session creation. The task trait requires a core-managed sandbox, but no such sandbox runner is implemented. Runtime loading, capability registration, policy ordering, hook timeouts/fallback execution and provider conformance remain unimplemented. Do not load untrusted code in-process. Browser clients cannot call private Enterprise services directly.

The executable contract check is `cargo test --locked -p niu-reference-extension`. It proves API use and core-side validation behavior; it does not prove gateway integration or close release acceptance row R13.

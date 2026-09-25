# Capability and adapter contracts

Status: proposed public contracts. Adapter coverage is not implemented yet.

## Protocol fidelity

Represent each protocol operation and its supported capabilities explicitly. Provider adapters declare accepted request fields, output fields, streaming event types, tools, structured output, modalities, and usage reporting. Unsupported semantic parameters return a clear error rather than being silently discarded.

Transformations report compatibility and loss. Strict mode rejects conversions that change requested semantics. Provider adapters encode and decode provider protocols; they do not own tenant authorization, budget settlement, or retry scheduling.

## One request coordinator

The gateway owns authentication, eligible-provider selection, policy invocation, durable admission, attempt counts, deadline, retry decisions, output commitment, and settlement. There is one owner for retry decisions. Provider SDKs and adapters must not add hidden retries, hedging, or cross-model fallback.

Each decision includes a stable reason code and binds to the request, attempt, tenant, policy revision, offer revision, and configuration generation. A retry repeats authorization, eligibility, required policy, and financial admission.

## Provider compatibility evidence

An approved provider offer has an immutable revision and a report covering request transformations, SSE frame boundaries, UTF-8 splits, tool argument fragments, provider errors, usage, cancellation, timeouts, and terminal events. Self-reported capabilities and active conformance observations are stored separately.

Unknown capabilities are unavailable for hard requirements. Changed endpoints, credentials, regions, model mappings, rates, or privacy conditions create a new revision and invalidate affected approval evidence.

## Extension boundary

The initial extension API is an explicit ordered set of typed stages. Each stage declares the data it may read and change, its deadline, and its failure behavior. Arbitrary in-process plugins are deferred until permission and isolation guarantees are defined. Browser clients cannot call private enterprise services directly.

# Native inference protocol integration

Status: implementation work remains open. Niu currently exposes Chat, Responses
and embeddings; it does not expose native Messages or GenerateContent. Existing
Anthropic/Bedrock conversion behind Chat is not native public-protocol support.

## Integration boundary

Add Messages and GenerateContent as explicit operations, independently of the
upstream adapter identity. A model mapping must opt in to the specific native
operation; an OpenAI-compatible credential or a Chat capability does not imply
that opt-in. Route-pool eligibility must check it before admission. Do not route
a native request through an implicit Chat conversion.

Reuse the existing authorization, route resolution, input inspection, attempt
admission, reservation, completion writer and customer-ledger mechanisms. Native
operations must not introduce a second financial or retry engine. Keep existing
Chat, Responses and embeddings contracts intact.

The implementation needs protocol-specific handling at these boundaries:

- Validate the entire native request, including text blocks and control fields.
  Reject unsupported tools, media, beta features and streaming modes before
  creating an attempt. Do not silently discard a field.
- Extract system and message text for local rules and authorized detectors.
  Redaction must modify the actual native document sent upstream. Required
  unsupported inspection fails closed, including output inspection.
- Preserve the native wire protocol while substituting only the explicitly
  selected upstream model. Use bounded response reads, endpoint validation,
  fixed credential headers and sanitized errors from the existing transport.
- Normalize reported usage under the native protocol's documented semantics.
  Cache and reasoning quantities must not be counted twice or invented when
  absent. Conservative admission bounds and immutable customer tariffs still
  apply; missing usable usage remains unresolved.
- Serialize only the supported customer-safe response fields, including nested
  metadata. Never pass through arbitrary upstream commercial or diagnostic
  fields. Persist protocol-appropriate finish information without request text.
- Keep stream event parsing and finalization protocol-specific. Once headers
  have been committed, neither a retry nor another credential may replace the
  operation. Nonstreaming support alone must not advertise streaming support.

Generate OpenAPI from handlers and add SDK methods with the same declared
capability boundary. A placeholder or explicit rejection is not a working native
protocol implementation.

## Current-input upstream prerequisite

OpenRouter documents its [Messages-compatible input](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration).
On 2026-10-11, a bounded direct request to its `/api/v1/messages` endpoint used
the owner's saved personal credential and `openai/gpt-4.1-mini`. The response was
HTTP 200 with native `type: message`, assistant text containing the fresh requested
marker, `stop_reason: end_turn`, and reported usage of 14 input and 6 output tokens.
The request had a 32-token output limit. Raw request/response evidence was retained
privately; no credentials or response identifiers are published here.

This establishes an available actual Messages test channel for subsequent Niu
integration. It bypassed Niu, so it does not verify Niu admission, guardrails,
customer charging, streaming, cache accounting or a native public route. It does
not establish Claude Code compatibility, Gemini availability, commercial supply
or discount rights. No existing Niu model configuration or database was changed.

Acceptance must exercise actual requests through Niu, negative undeclared-route
and unsupported-input cases, scoped access and limits, exact independently
reconciled customer charges, unknown-usage handling and restart. Fixture outcomes
provide no acceptance signal. Native media/tools and streaming require their own
declared and verified coverage.

# Structured Chat streaming

OpenAI-compatible routes with `supports_structured_output` enabled accept
`stream: true` with `response_format.type` equal to `json_object` or
`json_schema`. Public and dashboard Chat use the same execution path. Tools
combined with structured output and native Anthropic/Bedrock structured routes
remain unsupported. Endpoint compatibility still requires verification;
[OpenRouter documents streaming support](https://openrouter.ai/docs/guides/features/structured-outputs)
but describes provider-specific schema enforcement differences.

## Delivery and accounting

Content deltas are provisional. Niu accumulates at most 1 MiB of content and
refusal bytes across at most 128 choices, requires finished choices, and checks
assembled JSON before releasing `[DONE]`. JSON-object mode requires an object;
schema mode uses the same offline, bounded schema compiler as buffered Chat.
Explicit nonempty model refusals remain refusals rather than fabricated JSON.
This is terminal validation, not a guarantee that every partial delta is a valid
JSON document or that already delivered content can be recalled.

Invalid final content produces an `upstream_invalid_response` SSE error with
code 502 and no `[DONE]`. The HTTP stream may already have started with 200.
Sanitized final usage remains available when reported. A durable content-free
failure record distinguishes delivery failure from execution: valid terminal
usage still completes accounting exactly once. Missing or conflicting usage
remains unknown; disconnects and absent terminal evidence retain the existing
uncertainty behavior. Niu does not retry generation to repair JSON.

## Current-input verification, 2026-10-10

An isolated native PostgreSQL database and current gateway binary used the saved
personal OpenRouter credential with internally configured verification prices
and approved credit, without creating merchant funding or a commercial offer.

- Actual streamed `json_schema` output matched a fresh marker schema. After a
  gateway restart, actual streamed `json_object` output matched the requested
  marker object. Both delivered terminal markers and reported usage. Independent
  arithmetic matched customer charges, balance debits and configured expenses;
  holds were released. Key-cap denial, invoice settlement, idempotent refund and
  another restart retained the expected records without duplicate charges.
- An actual JSON-object request for a larger document with a small token limit
  returned incomplete JSON. The client received usage and an explicit SSE error,
  without `[DONE]`. Independent usage-based arithmetic matched one customer debit;
  the attempt remained confirmed completed with an `upstream_invalid_response`
  diagnostic. No active balance hold remained. Restart retained the same charge,
  usage and diagnostic and did not insert a second debit.
- Separate strict-schema requests returned a complete object despite a requested
  one-token output limit. This upstream observation does not establish a hard
  output bound. Niu continues to account for reported usage rather than truncate
  the charge to the requested maximum.

These runs do not qualify multi-choice streaming, refusals, the 1 MiB boundary,
all schema features, arbitrary providers, disconnect recovery for this new
combination, or sustained-load performance. No fixture outcome is used as
integrated evidence. Original development data and encrypted identity were
preserved; temporary gateways and databases were stopped.

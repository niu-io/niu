# Capability and execution contract

Niu routes model API calls and longer-running agent tasks through a shared control plane, but their protocols remain distinct. A model provider advertises capabilities such as chat completions, streaming, tool calls, structured output, media input, and provider-reported usage. An agent runtime may advertise task continuation, cancellation, isolated workspaces, shell execution, and validation support. No feature is inferred from a similar product or model name.

Each versioned resource offer reports support as `native`, `translated`, `limited`, or `unsupported`. A limited capability includes a description and requires explicit acceptance. Unsupported semantics fail before dispatch rather than disappearing silently during translation.

## Attempt state

For every attempt, record four independent facts:

- **Execution certainty:** not sent, may have executed, confirmed completed, or confirmed not executed.
- **Response progress:** not committed, headers committed, body complete, or interrupted.
- **Usage confidence:** unknown, estimated, or provider reported.
- **Settlement:** unresolved, estimated, settled, or requiring reconciliation.

An upstream timeout after dispatch does not prove that the operation was not executed. Missing usage remains unknown. A completed provider operation can still have an interrupted client response; an end-of-stream or transport error does not by itself settle cost.

## Retry gates

Only one Niu coordinator chooses retries. An attempt may be replayed only when its body is replayable, its execution semantics permit replay, the permission is still current, the shared deadline and attempt budget allow it, cost exposure is reserved, and response headers have not been committed. Adapter libraries do not perform hidden retries.

These are public contract rules. They do not claim that the current gateway persists every attempt or enforces every gate; those controls must be implemented and tested before release guarantees are made.

## Current gateway usage evidence

The management metrics endpoint exposes `usage.attempts_total`, `attempts_unknown`, and `attempts_provider_reported`. Each dispatched attempt begins unknown. A direct non-streaming response with both nonnegative integer token counts promotes that attempt to provider-reported; explicit zero counts are valid evidence. Token totals include only those complete observations. Missing, partial, invalid, or overflowing counts remain unknown, as do cancelled calls and transport failures.

Native adapters currently normalize some missing usage to zero, so their normalized counters are not accepted as provider evidence. The OpenAI-compatible stream adapter parses SSE usage and terminal events and persists completion before forwarding the terminal event. Missing or conflicting usage remains unknown; EOF without a terminal event does not confirm execution. These counters are process-local and reset on restart; they are not a durable financial ledger, settlement proof, or a measure of successful task completion.


The SSE inspector follows [standard event framing](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream), supports fragmented UTF-8, CR/LF/CRLF and multiline data, and limits an inspected event to 64 KiB. Wire bytes are preserved. Invalid JSON, error events, oversized events and truncated streams abort delivery without settling costs. Dropping the response drops the upstream reader; uncertain attempts remain durable. A database failure while persisting completion interrupts the stream instead of forwarding an unrecorded terminal event. Financial settlement and client-delivery acknowledgement remain separate work.

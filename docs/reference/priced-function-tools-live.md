# Token-priced function tools: current-input verification

Date: 2026-10-10.

## Implemented scope

Explicitly enabled compatible Chat routes can now price function-tool requests
and text-only tool-result conversations. Capability and schema checks still run
before admission. A dedicated `priced_chat` module owns the priced request shape
and byte guard, rather than expanding the common execution module.

The existing single-completion contract and output bound remain. Serialized
messages, tool definitions, tool choice, parallel-call flag and response-format
instructions contribute to the input byte guard. Historical function arguments
must be JSON objects encoded as strings; tool-result messages require a call ID
and string content. Image/audio input and provider-hosted tools are not admitted
by this contract. Niu does not execute client functions or charge for external
function execution.

The byte guard is not a provider tokenizer or a guarantee against reported
overruns. Usage settlement continues to use the actual provider-reported token
counts and independently pinned customer and expense rates.

## Actual compatibility finding

The first live buffered tool response included an `index` field inside its
function call. Replaying that returned call as assistant history was initially
rejected by the new priced shape validator. The persisted upstream response
independently confirmed the field. The validator now accepts an optional
nonnegative integer index, and the SDK exposes it without dropping it.

## Completed run

A separate native PostgreSQL database and local gateway used management-created
configuration, bounded administrator credit and the owner's personal OpenRouter
credential. The mapping was private and had no commercial Supplier offer or
external funding receipt. Rates were explicit internal verification inputs,
as in the [credit workflow](internal-credit-workflow-live.md).

| Actual request | Reported input | Reported output | Customer charge, USD nanounits |
| --- | ---: | ---: | ---: |
| Streamed forced function call | 60 | 11 | 18,272 |
| Buffered forced function call | 60 | 11 | 18,272 |
| Client tool result after gateway restart | 98 | 7 | 19,013 |

The first two responses selected the declared function and returned JSON
arguments containing the fresh request marker. The stream included terminal
reported usage, `tool_calls` finish reason and `[DONE]`. After gateway restart,
the client supplied the buffered function result and the model returned the same
marker. The client performed the function step; the gateway did not.

Independent database reads matched all three customer charges and negative
balance entries to a separate exact integer calculation from delivered usage.
Configured expense amounts were calculated separately. All holds were released;
charge reconciliation had no missing, mismatched, unexpected or duplicate sources
and no settled open reservation.

Six actual malformed, oversized or unsupported requests returned HTTP 400:
nonboolean parallel-call flag, oversized tool description, hosted-tool type,
non-object historical arguments, negative call index and image message content.
The database still contained only the three completed attempts and charges.

Temporary keys were revoked, the mapping and Supplier disabled, and isolated
servers stopped. The original credential identity and development database were
preserved. The rebuilt development gateway reached readiness. Rust compilation,
static checks, SDK compilation, contract parsing and public-boundary review
completed. No fixture outcome supports this checkpoint.

Parallel returned calls, tool-call cancellation, other model/provider combinations,
schema-rejected billed output, merchant funding and sustained performance remain
unverified. The customer charges are internal credit-backed accounting evidence,
not a claim of commercial supply qualification or settled external payments.

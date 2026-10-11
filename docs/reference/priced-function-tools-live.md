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

At that checkpoint, parallel returned calls, tool-call cancellation, other model/provider combinations,
schema-rejected billed output, merchant funding and sustained performance remain
unverified. The customer charges are internal credit-backed accounting evidence,
not a claim of commercial supply qualification or settled external payments.

## Streamed tool conversation on the current backend (2026-10-12)

Committed gateway `ef77d30ea1f4084c10d89f6716431df18be6db1c`, checked against
its retained binary digest, ran in an isolated copy of the actual 240-request
streaming database. A fresh workspace key first received 501 when calling tools
on the structured-output-only model configuration; no attempt was created.
Normal administration then explicitly enabled `supports_tool_calls` and
`supports_streaming_tool_calls`, preserving the existing customer and procurement
prices through the revisioned model update.

Two actual OpenRouter `openai/gpt-4.1-mini` streams exercised a forced single
`echo_marker` call and a follow-up with the client's tool result. Raw deltas
assembled the expected function name and strict JSON marker argument; the first
stream finished with `tool_calls`. The second returned the same marker as text.
Both included terminal usage and `[DONE]`. Niu transported the tool conversation;
the verification client supplied the tool result.

After Gateway restart and temporary-key revocation, a separate process reopened
the stopped database and rehashed and parsed both raw SSE artifacts. Each usage
matched its completed attempt, pinned customer token rates and exactly one debit
in its original bound account. Their total customer charge was **37,655 USD
nanounits**. The original 240 records remained alongside these two new requests;
no customer hold or funding receipt existed. The checked procurement and encrypted
credential fields were absent from the streamed objects.

This extends the stated single-tool conversation evidence on the current backend.
It does not qualify parallel tools, cancellation, sustained tool workloads, other
Providers, task acceptance, received merchant payments or commercial Supplier
rights. No fixture outcome supports it. Original development data and encrypted
identity were unchanged.

## Two returned streaming tool calls (2026-10-12)

A separate current-input run on the same pinned `ef77d30` binary and a fresh
stopped copy of the actual streaming database requested `parallel_tool_calls: true`
with two strict-schema functions. The model returned both `echo_marker_a` and
`echo_marker_b`, with distinct call IDs and delta indices. Independently assembled
arguments for each index contained the requested marker. The client returned both
tool results; a second actual stream answered with that marker.

After restart and key revocation, separate raw-SSE and reopened-database inspection
verified both function identities, distinct IDs, per-call arguments, `tool_calls`
finish reason, follow-up content, terminal usage and `[DONE]`. Each model request
had exactly one charge and matching debit in its original bound account. The two
customer charges totaled **88,643 USD nanounits**. There were no open customer
holds or funding receipts; the checked procurement and credential fields were
absent from both customer streams. The initial capability-disabled request returned
501 without creating an attempt, before explicit API configuration enabled tools.

This verifies two returned tool calls and a client-supplied result conversation
for this model. It does not establish concurrent tool execution by Niu, arbitrary
tool counts or delta interleavings, cancellation, sustained load or other Providers.
The personal upstream and approved internal credit retain the earlier commercial
boundaries. No fixture outcome is evidence. Original development configuration,
database and encrypted identity were unchanged.

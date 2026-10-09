# Live Chat cancellation and structured output

Date: 2026-10-09. Scope: actual owner-funded OpenRouter requests through the
running Niu gateway and PostgreSQL, using `openai/gpt-4.1-mini`. This checkpoint
does not qualify commercial supply, customer charging or the complete F04 gate.

## Client disconnect

A current-input streaming request was closed by the client after receiving its
first content delta. The durable request record retained `may_have_executed`,
`unknown` usage confidence, null prompt/completion token counts, no finish reason,
and incomplete delivery timing. The record did not invent a successful finish,
zero usage or a provider failure.

An independent database query found exactly one attempt for the dedicated key,
no finish-reason row, no retained payload and no customer balance entry. The API
record was identical after gateway restart. This establishes preserved
uncertainty for this disconnect; it does not establish that upstream execution
stopped, that upstream expense was zero, or that a refund occurred.

## Strict structured output

The personal model mapping enabled structured output after checking the actual
upstream model capability metadata. A nonstreaming request supplied a strict
object schema requiring `status: "ok"` and integer `count: 3`, with no additional
properties. The actual HTTP 200 response was independently parsed and its object
matched those constraints. The request record reported confirmed completion,
provider-reported usage and the `stop` finish reason, without a failure.

Using the same dedicated key, the streaming form returned HTTP 501 and an invalid
schema type returned HTTP 400. Neither response contained an attempt identifier.
Independent PostgreSQL inspection found only the single successful attempt for
that key, confirming these two rejected requests created no upstream attempts.
There was one finish-reason row, no retained payload and no customer balance
entry. The successful request record was identical after gateway restart.

## Limits and cleanup

Both temporary API keys were revoked. Requests explicitly disabled payload
retention; private verification artifacts and credentials are outside Git.
Customer charge fields remained owner-funded with no customer amount. These
observations do not qualify prepaid settlement or unknown-usage reconciliation
for commercially billed requests. Streaming structured output remains explicitly
unsupported. No frontend acceptance or performance qualification was performed.
The evidence comes from actual calls and independent final-artifact checks;
fixture-test outcomes are not used.

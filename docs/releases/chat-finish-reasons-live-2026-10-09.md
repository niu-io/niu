# Live Chat finish-reason and tool-call checkpoint — 2026-10-09

This checkpoint uses current-input personal OpenRouter requests through Niu,
followed by independent API, CSV and PostgreSQL inspection. No fixture-test
result supports the observations below.

## Capability configuration and successful responses

The personal text mapping initially had tool capabilities disabled. Niu returned
HTTP 501 before upstream dispatch. The actual upstream model catalog advertised
`tools` and `tool_choice` for `openai/gpt-4.1-mini`; the private personal mapping
was then configured for ordinary and streaming tool calls and exercised live.
Catalog metadata alone was not treated as qualification.

Actual responses covered:

- A nonstreaming completion with `stop`.
- A streaming request with a one-token output limit and `length`.
- A nonstreaming forced function call with short JSON arguments and `tool_calls`.
- A streaming forced function call with short JSON arguments and `tool_calls`.

The streaming length response repeated the same terminal reason in multiple
events. Niu correctly stored one choice-level observation. The private verifier
initially expected one event, then was corrected to distinguish repeated events
from conflicting reasons; that assertion was not a product defect.

## Invalid delivery remains distinct from execution

A longer forced-function request with a limited output budget returned HTTP 502
from Niu while retaining confirmed execution, provider-reported token counts,
`tool_calls` and `upstream_invalid_response`. A separate actual direct upstream
request with the same input and budget produced a `tool_calls` response whose
argument string was invalid JSON and whose completion count reached the budget.
That direct response demonstrates the upstream condition; it is not a retained
copy of the earlier Niu response.

The gateway now describes this category as `The provider returned an invalid
response`, rather than the ambiguous generic request-failure message. Another
actual Niu request with an eight-token budget verified the new HTTP 502 message
and preservation of completed execution, provider-reported usage and safe failure
classification. No tool was executed by this workflow.

## Independent artifacts

All six Niu requests opted out of payload retention. Their saved summaries and
CSV finish reasons matched the observed outcomes; the two invalid deliveries
also exported their failure classification. Restarting the gateway preserved the
earlier records exactly. Independent PostgreSQL inspection found six finish
records, zero payload rows, two invalid-response classifications and zero
customer ledger entries. Billing remained owner-funded, without customer charges.
Temporary qualification keys were revoked. Private responses and artifacts are
kept outside Git.

This covers the exercised Chat model and request shapes. It does not qualify all
tools, structured outputs, cancellation, Responses/native protocols, customer
charging or the full release. Payment querying was separately rechecked and
still rejected with business code 6003; real top-up settlement remains open.

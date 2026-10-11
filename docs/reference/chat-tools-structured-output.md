# Chat function turns with structured final output

Function tools may be combined with `response_format` types `json_object` and
`json_schema` on configured OpenAI-compatible routes. The model must separately
declare tool calling and structured-output support; streaming additionally needs
streamed-tool support. Niu transports tools and client tool results; it does not
execute tools or determine task acceptance.

A function turn is intermediate output. Its call must identify a declared
function with a nonempty bounded ID and JSON-object arguments. Niu enforces
`tool_choice` and disabled parallel-call constraints, and rejects contradictory
refusal/tool observations. The client remains responsible for argument semantics
and safe tool execution; object-shape validation does not establish compliance
with every function parameter schema.

A final text answer still must satisfy the requested JSON contract. A validated
tool turn may have null text without being rejected as malformed final JSON.
Model refusals remain explicit output. Tool results are sent in another request,
using the actual call ID and preserving the desired final response format.

For streams, assembled content, refusal text and tool metadata/arguments share a
1 MiB bound. There are at most 128 choices and 128 tool-call entries across the
stream. Complete declared call shape, tool selection and JSON final text are
checked before `[DONE]`. Partial deltas are provisional: a client must not execute
a tool just because arguments appeared before the terminal validation. Invalid
terminal output retains the existing error-without-DONE behavior; valid observed
generation usage remains separate accounting evidence.

## Actual scoped verification — 2026-10-12

Clean committed `a5f2f3b` completed four full client round trips: buffered and
streamed requests, each using JSON schema and JSON object modes. Every round trip
used a real declared function call, client-computed result and final answer with
a fresh requested marker through the saved personal OpenRouter credential.
Named forced-tool choice and disabled-tool final choice were exercised.

Independent reopening parsed all eight retained response artifacts and checked
request schemas, actual call IDs, argument objects, computed results, terminal
finish reasons, native usage and HTTP timing records. Exact original-rate
customer charges matched their negative balance entries: 215,313 USD nanounits.
No customer reservation or request-failure record remained. Restart retained the
charges and the verification key was revoked. Prices and approved credit were
internal verification settings, with no funding receipt or commercial supply
claim.

A low-output-budget probe returned complete valid JSON rather than the expected
malformed response; it is not evidence for malformed-output rejection. Actual
malformed combined-tool responses, interleaved parallel calls, multiple-choice
combinations, remaining selection/format combinations and broader provider
coverage remain unverified. This implementation does not reconstruct the
unidentified original handoff 502 or establish a New API performance comparison.


## Required/auto selection with parallel calls disabled — 2026-10-12

A separate clean `a5f2f3b` run exercised `required` with JSON schema and `auto`
with JSON object, each in buffered and streamed delivery. `parallel_tool_calls`
was false throughout. Every observed first turn returned exactly one declared
function call; each client-computed tool result was followed by a final answer
with tool choice `none`, the unchanged format and a fresh requested marker.

Independent reopening reassembled and parsed all eight responses, checked the
retained request selection/parallel parameters, call IDs, argument objects and
computed results, and matched native usage and terminal observations to exact
customer charges/debits: 247,659 USD nanounits. Restart retained the eight
charges with no open customer reservation, request-failure record or funding
receipt. The temporary key was revoked. The original native runtime and data
were untouched; internal prices/approved credit do not qualify commercial supply.

These are two observed selection/format combinations, not every possible pair.
Auto may legitimately produce a final text turn without calling a tool; this
particular run chose the tool. An observed single call with parallel disabled
does not prove rejection of an upstream multi-call violation. Interleaved
parallel output, multiple choices and malformed combined tool output remain
unverified. This supplements the named-choice/disabled-choice checkpoint rather
than changing its retained amounts or implementation revision.


## Two declared calls before a structured answer — 2026-10-12

A separate clean `a5f2f3b` run enabled parallel calls and required tools with two
different declared functions. Buffered and streamed first turns each returned
two distinct call IDs. The client parsed each real argument object, computed
its result and returned both results with their own IDs. Tool choice `none`
then produced the unchanged JSON-schema final answer containing both products
and a fresh requested marker.

Independent reopening reassembled the actual buffered/streamed call artifacts,
checked both declaration names and ID-to-result associations, final JSON and
terminal usage, and recomputed four original-rate customer charges/debits:
236,052 USD nanounits. Restart retained all charges, with no customer holds,
request-failure record or funding receipt. The temporary key was revoked.
Personal upstream access and internal verification tariffs/credit do not imply
commercial supply or a paid top-up.

The observed argument fragments were not interleaved between tool indexes. This
verifies multiple-call assembly and client round trips, not interleaved fragments,
multiple choices, concurrent client tool execution or rejection of upstream
parallel-call violations. An earlier named-function probe returned only one call;
that valid upstream choice was not treated as a product failure or multiple-call
evidence. No fixture outcome is used as evidence.


## Customer reporting and invoice request counts — 2026-10-12

A stopped-database copy of the preceding two-tool-call history was served by the
same clean `a5f2f3b` implementation. An ordinary workspace viewer read Logs,
full-range summaries, CSV and the customer invoice. All four generation request
IDs and individual native token quantities/charges matched the original calls.
The invoice contained one original-rate line with four requests, totaling
236,052 USD nanounits; repeated same-key invoice creation returned that invoice.
Intermediate tool actions did not create additional charge or invoice entries.

Independent reopening parsed the original four response artifacts again and
matched every reported usage/charge record, exported row and invoice amount to
the exact individual debits and four invoice entries. There was no new inference
or balance entry during reporting. Restart preserved the full Logs response,
invoice line and byte-identical CSV. The viewer could not read procurement costs;
a different organization could not read Logs, CSV or this invoice. Recursive
response checks found no procurement fields. Temporary readers were revoked and
a revoked-reader export was rejected.

This verifies backend reporting and request-based invoice grouping for the
actual multi-call history. It does not establish frontend presentation, task
acceptance, commercial supply, a paid top-up or performance under concurrent
reporting load. The source evidence and original development database were
preserved.


## Actual output-budget overrun observation — 2026-10-12

The retained low-output-budget probe on `a5f2f3b` produced complete valid JSON
with reported input/output quantities of 103/16. Its recorded output bound was
1, so it could not qualify the intended malformed-output refusal. A metadata-only
independent reopening instead verified that Niu retained the actual quantities
and the platform's bound-exceeded diagnostic rather than replacing usage with
the requested limit. No new inference or clock/configuration change was made
to inspect this observation.

Original-rate arithmetic gave a customer charge of 28,519 USD nanounits, matching
one negative charge entry. This was below the original customer reservation of
253,828 nanounits, which was released. The copied history contained the preceding
eight qualified calls plus this one generation: nine exact charges/debits totaling
243,832 nanounits, with no open customer hold or funding receipt. Procurement
prices/expenses were retained privately and not substituted for customer amounts.

This verifies actual-use accounting within the monetary reservation for this
observed overrun. It does not prove an upstream minimum output limit, explain
why the limit was exceeded, guarantee arbitrary overruns stay within reservations,
or qualify malformed-output rejection. Requested generation limits and measured
usage have different meanings; the requested value is not billing evidence.


## Plain-text streamed tool validation — 2026-10-12

Previously, the complete streamed function-call validator was attached only to
JSON object/schema output. Buffered calls already checked call shape and tool
selection, while ordinary text-format streams lacked this terminal validation.
Clean `5a8a39c` attaches the existing collector whenever the streamed conversation
has tool semantics, including prior tool messages, with JSON parsing disabled
for final text. No second function-call parser or accounting path is introduced.

The collector checks declared function names, bounded IDs/argument objects,
unique call IDs per choice, terminal tool turns, refusal conflicts, `tool_choice`
and `parallel_tool_calls`. Its existing total 1 MiB content/refusal/tool metadata
and argument bound, 128 choices and 128 tool slots also apply to text tool streams.
Final assistant text need not be JSON. Clients must treat partial tool deltas as
provisional and wait for validated `[DONE]` before executing a tool. Invalid
terminal output uses the existing `upstream_invalid_response` SSE error without
`[DONE]`; the message refers to format or tool constraints. Independently reported
terminal usage remains accounting evidence. Function parameter-schema semantics
remain the client's responsibility.

Current-input verification used fresh isolated PostgreSQL and actual personal
OpenRouter access with explicit internal credit and customer tariffs. Four client
round trips covered buffered/streamed calls with omitted `response_format` and
explicit `{ "type": "text" }`. The first turn used a named function or `required`,
with parallel calls disabled. The client independently calculated 23 × 47 from
the actual returned arguments, linked the tool result by call ID, and requested
`tool_choice: none` for the follow-up. Every final response contained the result
and its fresh marker as actual non-JSON text. No inference retry was made.

Independent reopening hashed and re-parsed all eight retained responses, checked
call arguments, linked tool results, finish reasons, native usage, completed
timing and exactly one original-rate charge/debit per generation. Total customer
charges were 232,598 USD nanounits. Restart preserved all eight charges; the key
was revoked, and no customer hold, failure or funding receipt remained.

The same clean executable also completed four fresh buffered/streamed JSON
object/schema tool round trips, eight actual calls. Independent reopening checked
all original responses and exact debits totaling 219,016 USD nanounits, with
restart retained and no customer hold, failure or funding receipt. These totals
belong to separate histories and must not replace earlier checkpoint totals.

Gateway clippy and handler-annotation consistency checks completed separately;
no fixture outcome supports the integration conclusions. The verified executable
was installed into the preserved native runtime after a fresh backup was restored
and independently compared in isolated PostgreSQL. Configuration, encrypted
credential identities/revisions and durable business counts remained unchanged.

These observations establish actual compatible text/JSON tool round trips and
accounting on the stated implementation. Those successful round trips alone do not exercise malformed text-tool streams
or every refusal/selection violation,
interleaved fragments, every Provider or sustained tool-workflow capacity. The
historical initial 502 is not reconstructed by this code inspection or these
successful requests. Personal access is not commercial supply qualification.


## Actual malformed text-tool streams — 2026-10-12

Two fresh requests on clean `5a8a39c` requested a long function argument under a
16-token output bound, once with omitted format and once with explicit text.
Both actual upstream streams delivered a named function call whose accumulated
arguments were incomplete JSON (30 and 38 bytes). The upstream nevertheless
reported terminal `tool_calls` observations and native usage. This is an observed
inconsistent tool result, not a claim that the model always reports this reason
on truncation or obeys every requested token bound.

Niu returned an `upstream_invalid_response` SSE error with code 502 and suppressed
`[DONE]` in both streams. HTTP response headers had already carried status 200;
that delivery status is preserved rather than rewritten after the body starts.
No tool was executed and neither request was retried. Native input/output
quantities were 114/16 and 110/16. Independent reopening hashed/re-parsed both
retained response bodies, reconstructed the malformed arguments and terminal
observations, and matched the exact quantities to confirmed completed attempts.

Original-rate customer charges were 29,877 and 29,383 USD nanounits, each with
one equal negative balance entry: 59,260 total. Delivery validation failure did
not erase actual upstream usage or imply nonexecution. Restart retained both
charges, failure records and finish observations. There were no outstanding
customer/procurement holds, funding receipts or live temporary inference keys.

A stopped copy served customer Logs, request detail and CSV through an ordinary
workspace viewer. Independent reopening matched all reported quantities,
customer amounts and timing to the original actual streams and stored records.
Both rows exposed confirmed execution, `charged`, completed HTTP 200 delivery,
and `upstream_invalid_response` with a null upstream HTTP error status. CSV
retained the same failure and delivery distinction. List and detail were equal;
restart retained both and byte-identical export. Procurement access returned 403,
foreign-scope list/detail/export were denied, and revoked-reader export returned
401. Reporting generated no new attempt or financial entry.

This qualifies actual malformed argument rejection and accurate accounting for
these two text-tool streams. It does not qualify every tool-selection violation,
interleaved fragmentation, missing-terminal/cancellation case or other Provider.
It does not reconstruct the historical handoff 502. The failure's SSE code and
HTTP header status describe different boundaries; clients must inspect the SSE
error and validated terminal marker. Personal access and internal credit remain
separate from commercial supply and received cash.

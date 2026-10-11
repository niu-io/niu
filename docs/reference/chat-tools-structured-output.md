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

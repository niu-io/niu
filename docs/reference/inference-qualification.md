# Inference qualification

This matrix records verified behavior, rather than inferring compatibility from a model catalog or route capability flag. It is a development checkpoint dated 2026-10-02, not full release qualification. Community installations must verify their own configured endpoints and models. OpenRouter is one demo Supplier; these checks establish no discounted supply agreement.

## Current development availability

On 2026-10-06, the owner clarified that the OpenRouter demo is personal upstream-key testing, not intended resale. The durable owner-scoped route is implemented: shared discovery excludes personal credentials, while the owning account can discover and call its enabled mappings. Two bounded Niu gateway `openai/gpt-4.1-mini` calls succeeded with the saved private key, covering nonstreaming and terminal streaming with reported usage. A saved dashboard Chat response also survived reload and opened its matching Logs detail at desktop and narrow widths. Personal requests have immutable route bindings, no Niu prepaid debit and an explicit `owner_funded` accounting status displayed as “Own API key.”

[Gateway observations](../releases/personal-openrouter-gateway-check-2026-10-06.json) and [personal dispatch verification](../releases/personal-dispatch-verification.md) describe the qualified subset. The earlier [direct upstream observations](../releases/personal-openrouter-text-check-2026-10-06.json) remain separate evidence. Twenty-five mappings are available to the owning account; this is configuration availability, not qualification of all models. Commercial offers remain inactive and unqualified. These checks do not establish discounted supply, resale rights, other protocols or full release acceptance.

The earlier authenticated catalog and Supplier administration read on 2026-10-02 found one available alias, `google/gemini-2.5-flash`. All 25 saved OpenRouter offers were inactive and unqualified, including `openai/gpt-4.1-mini`. Those explicit offers are excluded from discovery and resolution until their current qualification and activation requirements are met. Gemini's legacy route has no explicit offer and remains available under the compatibility path; that availability does not qualify a Supplier agreement or customer selling tariff.

The successful calls below are historical observations of the named model/protocol, not an assertion that every listed route is currently enabled. Re-run them after any relevant model, route, capability or commercial qualification change before publishing current availability claims.

## Bounded personal catalog probe — 2026-10-06

All 25 configured owner-visible OpenRouter mappings returned HTTP 200 through Niu for the same short nonstreaming Chat request with a 16-token output limit. Every response had the requested public alias, a Niu attempt header and reported usage. Seventeen included visible message content; eight did not, so those eight are not qualified for usable text output by this probe. A small output bound may be insufficient for some models, but the observation does not establish why content was absent. A follow-up of those eight with a 256-token limit produced visible text and `stop` finish reasons for all eight; each reported reasoning usage (16–118 tokens). Across the original and follow-up probes, all 25 configured mappings have now produced visible nonstreaming text through Niu. This supports a bounded text capability observation, not a universal output-budget recommendation.

[Initial observations](../releases/personal-model-text-check-2026-10-06.json) and [bounded follow-up](../releases/personal-model-text-followup-2026-10-06.json) retain status, response checks, timing and token totals without generated content, credentials or internal identifiers. This extends live catalog evidence beyond the two historical models. It does not qualify streaming, tools, structured output, durable settlement, production availability or full F04/F07 acceptance for all 25 models.

## Bounded terminal-stream probe — 2026-10-06

All 25 owner-visible mappings returned HTTP 200, an attempt header, a terminal `[DONE]` marker and reported usage for a short Chat stream with a 256-token limit. Twenty-four included visible message output; `tencent/hy4-preview` did not, so its usable streaming text remains unqualified by this probe. No conflicting public alias was observed in model-bearing events; missing model fields alone do not prove identity. The probe uses streamed line events and does not exercise fragmentation, cancellation, tool calls, malformed framing or persistence/settlement reconciliation.

[Sanitized stream observations](../releases/personal-model-stream-check-2026-10-06.json) contain counts and response checks without payload content or internal identifiers. This is live terminal text coverage, not full streaming conformance or release qualification.

## Live model checks

| Supplier / upstream adapter | Model alias | Nonstreaming text Chat | Streaming text Chat | Tools / structured output | Responses / embeddings |
| --- | --- | --- | --- | --- | --- |
| OpenRouter / OpenAI-compatible | `openai/gpt-4.1-mini` | Fresh successful call; public alias, reported token usage and attempt header verified | Successful real Chat calls observed in development; complete terminal and cancellation coverage remains model-specific | Not qualified against the live model | Not qualified against the live model |
| OpenRouter / OpenAI-compatible | `google/gemini-2.5-flash` | Fresh successful call; public alias, reported token usage and attempt header verified | Successful real Chat calls observed in development; complete terminal and cancellation coverage remains model-specific | Two nonstreaming request shapes passed on 2026-10-03; declarations restored to disabled afterward; broader conformance remains open | Not qualified against the live model |

The nonstreaming checks used an active workspace key through the authorized dashboard Chat endpoint. Supplier monetary fields were absent from the customer usage object. Direct SDK/API authentication and packaged operation remain separate checks. No production availability or full model conformance claim follows from a successful call.

## Packaged client checkpoint — 2026-10-03

The packed JavaScript SDK completed direct API discovery, nonstreaming text Chat and a terminal text stream against `google/gemini-2.5-flash`. Scoped-key revocation, payload opt-out, complete timing and customer charge reconciliation were verified. The packed client-setup example also completed its live calls. See [the scoped acceptance record](../releases/sdk-inference-client-verification.md). This supersedes the earlier lack of direct JavaScript client evidence for basic Gemini Chat; tools, other protocols/models and packaged gateway operation remain unqualified.

## Adapter coverage

### Live disabled-capability checkpoint — 2026-10-04

The currently available Gemini demo route declares tools, structured output, Responses and embeddings disabled. Six direct authenticated API checks returned HTTP 501 with instructions to choose a supported model or remove the unsupported request feature: nonstreaming tools, streaming tools, JSON-object output, JSON-schema output, Responses and embeddings. The temporary workspace key had zero attributed attempts before and after the checks, and its last-dispatch metadata remained null. The key was revoked afterward; no route declarations or Supplier offers were changed.

This qualifies rejection of those six request shapes on the current running configuration, rather than asserting external model incompatibility. No billable inference was deliberately requested. Source inspection places the capability checks before durable admission; no independent network-egress capture was performed. The results do not qualify successful tools, other protocols or the full model matrix. [Sanitized response evidence](../releases/live-capability-rejections-2026-10-04.json).

### Live tools and structured JSON checkpoint — 2026-10-03

`google/gemini-2.5-flash` passed separate nonstreaming function-tool and strict JSON-schema requests directly against the saved OpenRouter demo endpoint and through Niu's authenticated Chat API. The tool response selected the declared function and returned the expected JSON arguments; the structured response parsed to the expected object. Each Niu request created exactly one durable attempt and one customer charge, with no retained payload. Requests were limited to 128 output tokens, and Niu executed no tools. See the [sanitized results](../releases/inference-tools-structured-verification.json).

The route declarations were enabled temporarily for this check, restored afterward, and the temporary workspace key was revoked. This qualifies only those two successful request shapes on the tested upstream model. It does not enable the features for customers, establish generic JSON Schema enforcement, qualify streaming tools, tool-result follow-up, cancellation, retries, restart durability or commercial supply rights, or close F04. Existing disabled-capability rejection evidence remains applicable to the restored route.

The rebuilt gateway then repeated both live calls successfully after adding offline JSON Schema validation. All 136 gateway tests and the process-replacement test passed; gateway Clippy with warnings denied, dependency license checks and the documentation build passed. Fixtures verify that valid JSON violating the requested schema returns `502` with an uncertain attempt, while malformed and externally referenced schemas return `400` without admission or upstream dispatch. Local references, required fields, types, enums, additional properties, object-only JSON mode, nonempty refusal handling and compilation limits have explicit coverage. This adds Niu schema enforcement; it does not establish all JSON Schema draft/model combinations or streaming conformance.

The gateway's `web::tests::inference` fixtures exercise a local upstream server and isolated PostgreSQL databases. They verify Niu's handling of the supplied responses; they do not qualify an external model.

| Behavior | Fixture / current boundary |
| --- | --- |
| OpenRouter Chat streaming | Compatible endpoint, public model mapping, reported terminal usage and scoped durable attempt evidence |
| Function tools | Explicit route opt-in, declared function names, JSON-object arguments, forwarded tool choice and provider-reported usage; Niu does not execute tools |
| Streaming function tools | Separate opt-in, preserved wire deltas and terminal usage; priced tool calls remain unsupported |
| Structured JSON output | Valid self-contained schemas compile before admission; returned JSON must match the requested schema, and `json_object` must return an object. External retrieval is disabled; schema size, depth, node count and regex work are bounded. Nonempty upstream refusals remain refusals rather than fabricated JSON. |
| Responses | Explicit opt-in; text input, nonstreaming output and SSE output with durable terminal input/output usage; see current streaming evidence below |
| Embeddings | Explicit compatible-route declaration, supported input validation, scoped admission and input-only usage settlement |
| Explicit effort | OpenAI-compatible nonstreaming `reasoning_effort` and streaming OpenRouter `reasoning` objects are forwarded unchanged; native adapters reject unsupported effort/thinking fields |
| Upstream failure | A Chat 503 fixture returns a gateway error with one durable attempt, one upstream dispatch and unknown usage; no automatic retry is observed |
| Credential and route control | Client fields cannot replace configured upstream credentials or routing; invalid credentials and incompatible workspace/key combinations fail |
| Interruption and content | Incomplete timing and retained partial content where observed; missing terminal usage stays unknown; explicit payload opt-out does not suppress metadata |

Responses conversation state, multimodal input and tools are outside the implemented Responses subset. Native Anthropic and Bedrock paths have no provider-specific conformance qualification. See the public API reference and route configuration for exact accepted shapes and flags.

## Remaining release checks

### Packed SDK tool round trips — 2026-10-03

The packed JavaScript SDK completed a two-call function-tool conversation against `google/gemini-2.5-flash` in both nonstreaming and streaming modes. Each first call selected the declared function with the expected JSON arguments; the client supplied a deterministic tool result, and each follow-up returned the expected final text. Streaming tool deltas were reconstructed by their call index, with a terminal finish reason and reported usage. The client performed the tool step; Niu did not execute tools or orchestrate tasks.

All four requests saved exactly four confirmed attempts and four customer charges, with no retained payloads. Saved token counts matched client-reported counts, charges matched the pinned customer tariff with upward rounding, and all timing records were complete. The test key's total attempt count was four. Original route declarations were restored and the key revoked. The [sanitized result](../releases/inference-tool-roundtrips-verification.json) records the packed SDK version and artifact checksum. This qualifies these round-trip shapes only; parallel tools, broader argument schemas/models, cancellation, failure/retry behavior, priced tool reservations and restart of these exact conversations remain open.

Qualify each enabled capability against its actual upstream model before presenting it as usable. Record client and gateway versions, exact protocol parameters, terminal usage, failure and cancellation behavior, restart durability and authorization boundaries. Fragmented-stream fixtures are necessary but do not replace live client evidence. Live effort/model behavior, retries and fallback across every supported model/protocol combination remain explicit release gates; neither successful basic Chat nor simulated upstream fixtures establish those claims.

### Packed SDK stream cancellation — 2026-10-03

The previous package reproduced a buffered-event defect: aborting after the first yielded event could still deliver an already-read second event. The SDK now checks cancellation before event delivery and cancels a pending reader independently of custom transport behavior. All 63 SDK tests passed, including buffered-event and pending-read abort regressions.

A fresh packed artifact then completed two bounded live Gemini cancellation checks: iterator return and abort after first text output. Client cancellation returned in 3 ms and 1 ms respectively in these individual observations; these are not performance percentiles. Both saved attempts remained `may_have_executed` with incomplete timing, unknown usage, null token counts, no customer charge and no retained payload. An already-aborted request created no additional attempt. Unknown usage is not a claim of zero upstream consumption or free inference. The temporary key was revoked, and the Supplier configuration was unchanged. See [sanitized evidence and the artifact checksum](../releases/inference-stream-cancellation-verification.json). Cancellation before headers, other models/protocols, races with terminal usage and restart of these exact interrupted calls remain unqualified.

### Rejected output accounting — 2026-10-03

The gateway now separates rejected delivery from terminal upstream execution evidence. A terminal Chat response with valid, complete, consistent reported usage can accrue its pinned customer charge even when schema or tool-output validation rejects the content with `502`. The earlier schema-mismatch fixture's uncertain execution state is superseded for responses meeting these evidence requirements. No rejected content or upstream error body is returned to the client.

All 137 gateway tests and process replacement passed. PostgreSQL/upstream fixtures verify a typed schema mismatch returns `502` while retaining reported 11 input and 3 output tokens, accruing exactly one customer charge at the pinned tariff. Repeating accrual creates no second charge. Missing counters, inconsistent totals and overflowing usage retain uncertain execution, null counts and no charge. Unit coverage also checks nonterminal envelopes, empty choices, upstream error envelopes, fractional counts and invalid values. These are controlled accounting fixtures, not new live Supplier failure-path qualification, and do not close F04 or F05.

## Unsupported-capability diagnosis — 2026-10-03

Disabled tools, streaming tools, structured output, Embeddings and Responses now retain HTTP 501 and `unsupported_operation_error` while identifying the unsupported feature and a supported request alternative. Protocol restrictions and incompatible streaming/feature combinations remain enforced; no capability is enabled by changing its error message.

All 134 gateway tests and process-replacement verification passed. A 12-case PostgreSQL/upstream fixture matrix verified zero operations, zero attempts and zero upstream calls. Five real requests from the packed JavaScript SDK against the existing Gemini route verified actionable 501 responses, absent admission headers and no persisted attempts; the temporary key was revoked. The [sanitized live result](../releases/inference-capability-errors-verification.json) records the checked cases. Gateway Clippy passed with warnings denied, and the OpenAPI descriptions were parsed and checked. These are rejection-path checks, not qualification of the rejected model capabilities.

## Material route changes

### Chat generation parameter validation — 2026-10-03

Chat now rejects malformed common sampling values and output limits before input inspection, admission or Supplier dispatch. Temperature, top-p and penalties use the [documented compatible parameter ranges](https://openrouter.ai/docs/api_reference/parameters); signed integer limits and seed are explicit Niu storage/contract bounds. Omitted defaults and valid explicit values are preserved, while native adapters and priced routes retain their stricter contracts.

All 139 gateway tests and process replacement passed. Fourteen PostgreSQL/upstream fixture cases verified field-specific `400` errors, no attempt headers, zero saved attempts and zero upstream calls; a valid boundary request was forwarded unchanged. Five actual requests to the rebuilt development service independently verified `400`, absent operation/attempt headers and zero saved attempts, with the temporary key revoked. See [sanitized live results](../releases/inference-parameter-validation-verification.json). Gateway Clippy passed with warnings denied. This closes the negative-temperature admission gap observed during Logs review; it does not qualify every provider-specific parameter or close F04.

The matrix was then expanded to 17 fixture rejection cases for malformed streaming flags/options. Unit checks cover conflicting non-null output limits and accepted nullable options. Four additional live requests verified rejection of ambiguous output limits, a nonboolean stream flag, nonobject stream options and a nonboolean usage flag, with no saved attempt. See [stream-option results](../releases/inference-stream-options-verification.json). The fresh 139-test gateway suite and process replacement passed again; this remains scoped request validation rather than full protocol qualification.

Changing a Supplier endpoint, adapter or credential, or a mapped model's upstream identity, route ownership or declared capabilities invalidates the affected offer's current qualification and pauses it. Previous immutable reviews remain available for audit. A new review must cover the changed route before activation; unchanged connection values and display-name changes alone do not require requalification. Rate revisions separately require current agreed-rate qualification.

Prepared Supplier requests also pin their qualification review. A changed review blocks dispatch even if the replacement route is qualified again at unchanged rates; prepare a fresh request against the reviewed route. After upgrading, pending historical bindings without a pinned review fail closed, while completed usage and accounting remain preserved.

### Responses category accounting boundary

A fresh PostgreSQL fixture verifies nonstreaming text Responses preserves authoritative input/output totals and explicit cache/reasoning subsets, including zero. Malformed output does not create category records. Streaming Responses remain rejected before upstream dispatch or attempt creation with an actionable HTTP 501 response; use supported Chat streaming instead. All 16 PostgreSQL inference regressions passed. See [token-category verification](../releases/request-token-categories-verification.md#responses-supported-boundary-regression) for the exact fixture scope. This does not qualify real upstream protocol coverage.

Streamed Chat accounting applies the same optional-total consistency check as buffered Chat. A provided `total_tokens` must be a nonnegative integer equal to input plus output. Malformed or contradictory totals remain unknown and cannot settle cost entries or save category observations; a terminal stream marker alone does not repair the evidence. Six parser tests and all eight PostgreSQL accounting regressions passed, including retained reservation for conflicting terminal totals.

### Responses and Embeddings usage consistency

Responses validates a supplied total against input plus output. Embeddings validates a supplied total against its reported input count and bounds input to the database's signed-64-bit range; completion remains zero by the Embeddings operation contract. Missing totals remain compatible when the required component counts are explicit and valid. Null, numeric strings, fractions, negative values and contradictory totals are not authoritative accounting evidence.

Two parser tests and all 16 PostgreSQL inference regressions passed. Routed Responses and Embeddings fixtures with inconsistent totals still deliver valid output but persist unknown usage and create no additional settled cost entries. The Embeddings fixture retains its outstanding reservation with previously settled spending unchanged; Responses categories are not saved from inconsistent usage. Gateway Clippy passed for all targets with warnings denied. These checks close these parser inconsistencies, not the full protocol/model matrix or F04/F05 qualification.


### Streamed model attribution

A missing model field on a usage-only or other stream event leaves earlier valid identity evidence intact. An explicitly malformed model field (including null, a non-string, an empty name, a control character within the name or an oversized name) makes actual upstream model identity unknown for the entire stream. A later valid name cannot repair that ambiguity. Conflicting valid names likewise remain unknown. This changes attribution only, without inferring a different model, retrying inference or discarding independently valid token usage.

All seven streaming parser tests passed, including fragmented malformed-before-valid and valid-before-malformed sequences. The routed PostgreSQL priced-stream regression passed with a consistent identity saved and an explicitly malformed follow-up saved as null; both settled the same valid usage and retained explicit cache/reasoning observations. Truncated and contradictory-usage cases still retained unresolved reservations. Gateway Clippy passed with warnings denied. No paid inference or UI change was part of this checkpoint; real Supplier/model identity qualification remains open.

### Customer stream framing and commercial metadata

Customer response inspection recognizes valid mixed LF, CR and CRLF line endings, including fragmented delimiters. When accounting recognizes a terminal blank CR line before its optional LF arrives, the response filter completes that delimiter before the tracked body stops; the customer receives the terminal event. Safe complete frames retain their original bytes, with an optional LF supplied for this terminal boundary case.

An initial UTF-8 BOM cannot hide upstream commercial fields from inspection. Supplier cost metadata is removed while reported token usage and user content remain intact. Once the terminal event is received, trailing content, contradictory usage, invalid UTF-8 and oversized trailers do not enter customer output or alter settlement.

The fragmented framing regression checks every fragment width for eight valid line-ending combinations using the accounting and customer parsers together, stopping at the same terminal point as the tracked body. Four customer-response tests passed, and the routed PostgreSQL priced-stream regression passed across nine fixtures, including mixed delimiters and a CR-only terminal marker; completed bodies include the terminal marker and exclude Supplier commercial fields. Gateway Clippy passed for all targets with warnings denied. These are local protocol and accounting regressions, not live upstream qualification, packaged acceptance or closure of F04/F05.

### Responses failure diagnostics

The nonstreaming Responses path uses the shared bounded, sanitized upstream HTTP
rejection classifier, typed transport failures and invalid-response classification.
It does not return raw upstream error bodies or credentials. A provider rejection
is still an uncertain execution outcome; the gateway does not automatically retry
or declare it safe to release a financial liability.

On the optimized current gateway, a real owner-funded OpenRouter request using an
invalid upstream model returned customer HTTP 400 with the static provider-rejection
message. Independent PostgreSQL inspection recorded exactly one dispatch and
`upstream_http_error`, upstream status 400, execution `may_have_executed`. The
response omitted the upstream model name and API secret. No customer debit was
created, the original credential remained unchanged, and the temporary workspace
key, model and credential were revoked or disabled afterward. This verifies HTTP
rejection diagnostics only; transport interruption and malformed successful-body
branches remain unverified by an actual upstream run. Responses streaming remains
unimplemented.
A subsequent real successful nonstreaming Responses call on the same build also
matched response totals, cached input and reasoning output against persisted
records, with no customer ledger mutation and all temporary access disabled.


### Responses streaming implementation and current-input evidence

Text-only Responses requests now accept `stream: true`. The gateway validates the
upstream SSE content type, bounds each event to 64 KiB, rejects error events and
requires `response.completed` or `response.incomplete` with a matching response
status and identity. `[DONE]` alone and EOF are not completion evidence. Terminal
reported input/output counts and token categories enter the existing durable
completion/settlement queue. Missing valid usage stays unknown. Cancellation,
transport failure and missing terminal events retain uncertainty and reservations;
there is no automatic replay. Buffered output guardrail requirements continue to
reject streaming before dispatch.

Customer SSE removes Supplier commercial metadata, substitutes the public model
alias in response objects and stops at the terminal event. JavaScript callers use
`client.responses.stream(request)`; the ordinary `create` method rejects a runtime
stream flag to avoid returning SSE as a JSON response. SDK readers release their
stream when terminated and require a Responses terminal event.

A real owner-funded OpenRouter request on the optimized gateway returned text SSE
and a completed response. Its public model alias and final input/output, cached
input and reasoning output quantities matched independently queried PostgreSQL
records. No customer ledger mutation occurred; the temporary key was revoked and
its personal model/credential disabled. This supersedes the earlier recorded 501
boundary for streaming. Paid streaming settlement, incomplete-status output,
malformed events, early cancellation and multi-gateway recovery still require
current-input qualification; this is not complete Responses API compatibility.

The built JavaScript SDK then completed a separate real Responses stream through
`responses.stream()`, observed text deltas and a final completed event, and matched
its returned usage to PostgreSQL. A real Chat stream through the shared stream
lifecycle also retained exact usage/category records after this change. Temporary
access was disabled and customer ledgers stayed unchanged for both runs.

### Current-input Responses cancellation and restart

Using the built JavaScript SDK, a real owner-funded Responses stream requested
bounded counting output and exited its async iterator immediately after the first
text delta, before any terminal event. Independent database inspection recorded
one dispatched attempt with `may_have_executed`, unknown usage, null token totals
and no token-category row. With the temporary key limited to one concurrent
request, its next Responses request returned `key_concurrency_exceeded` before
another upstream dispatch. The unknown attempt was not automatically released or
replayed. The timing record separately retained HTTP 200, an observed first output
and incomplete delivery; successful response headers do not prove completion.

After revoking the verification key and disabling its personal model/credential,
the optimized gateway was restarted against the same database. The original
attempt identity, execution/usage states, token totals, dispatch and completion
timestamps were unchanged. No customer ledger entry was created and the original
credential's revision/ciphertext digest remained unchanged. This verifies one
actual early SDK cancellation and preservation across restart. It does not prove
upstream cancellation, recover missing usage, settle a customer-funded request or
qualify arbitrary disconnect timing. An unknown outcome continues to occupy its
key concurrency allowance until authoritative resolution; revocation is access
cleanup, not evidence that upstream execution never occurred.

### Current-input Responses output-limit termination

A real owner-funded Responses SSE request asked for longer counting output with
`max_output_tokens: 1`. The upstream returned `response.incomplete`, status
`incomplete` and `incomplete_details.reason: max_output_tokens`. Its reported total
input/output, cached input and reasoning output quantities matched the completed
attempt and token-category records in PostgreSQL. The independent finish record
contained index zero with `length`. This is confirmed execution with truncated
output, not successful completion of the user's counting task.

The verification key had a concurrency limit of one. After the incomplete terminal
response, a second real nonstreaming Responses request on that same key completed;
independent inspection found both attempts completed. Thus this observed terminal
path released active occupancy, whereas the separately verified early cancellation
retained unknown occupancy. Neither run changed customer ledgers. Temporary access
was revoked/disabled and the original credential remained unchanged. This qualifies
the output-limit terminal case only; content-filter termination, paid settlement
and malformed/contradictory terminal events remain unverified.

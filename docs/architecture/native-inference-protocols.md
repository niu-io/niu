# Native inference protocol integration

Status: partial. `POST /v1/messages` implements native nonstreaming text on
explicitly opted-in OpenRouter and Anthropic routes. GenerateContent, native
streaming, tools and media remain unimplemented. Existing Anthropic/Bedrock
conversion behind Chat is separate from this native public operation.

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

## Messages text contract

Set `capabilities.supports_messages: true` on a saved model mapping (or
`supports_messages = true` on a static route). The provider must be `openrouter`
or `anthropic`; supply an explicit API base for Anthropic. Capability publication
is not verification of that upstream. The native operation sends `/messages`
without translating the request into Chat, and substitutes only the upstream
model name. Use a Niu bearer token or `x-niu-api-key`. Native client `x-api-key`
authentication and Claude Code compatibility are not declared.

The supported document contains `model`, a positive integer `max_tokens`, user
and assistant `messages`, optional `system`, `temperature`, `top_p`, up to four
`stop_sequences`, and omitted or false `stream`. Text may be a string or text
blocks. The JSON body is limited to 64 KiB; configured conservative priced input
and output bounds also apply. Version `2023-06-01` is fixed, and beta headers,
unknown fields, tools, media and streaming fail before dispatch. Workspace key
model grants and the existing admission, billing and inspection mechanisms apply.

The SDK exposes `client.messages.create(request)`. The handler annotation is the
source of the generated OpenAPI request/response contract and docs-site reference.
The model lists expose `supports_messages` (or `capabilities.messages` on the
public catalog) independently of Chat/Responses capabilities.

Customer output is projected onto the supported native fields. Arbitrary upstream
metadata, including commercial cost details, is discarded. Native total input is
`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. All four
input/output category values must be reported as valid counts before aggregate
usage is known. A missing or null category stays unknown; it is not zero. Unknown
aggregate usage does not mint a charge or release a spending reservation. Separate
cache-write prices remain outside this subset and are tracked in issue #17.

Local rules inspect system and message text before dispatch; redaction modifies
the native document. Buffered output rules inspect native text blocks and stop
sequence text. Withholding an already generated response does not erase its known
usage or customer charge. Handler errors use the native error envelope; shared
request-body/capture middleware may return Niu's standard error envelope.

## Current-input Niu verification — 2026-10-11

A fresh isolated PostgreSQL database and the current native gateway used the
owner's saved personal OpenRouter credential. Explicit internal verification
credit and customer rates exercised accounting; this was not a top-up, Supplier
agreement, commercial offer or claim of resale rights. The original runtime,
credential ciphertext and database were preserved.

Actual `anthropic/claude-haiku-4.5` Messages calls exercised text blocks and system
text. Two responses contained the fresh requested marker, including a call using
the built JavaScript `messages.create` method after a gateway restart. A third
actual generation was withheld by buffered output rules with HTTP 403; its
confirmed usage still accrued a customer charge. All three charges and matching
debits were independently recomputed from reported/persisted usage and the pinned
internal tariff, with each known-usage reservation released. A separate verifier
reopened the stopped database and confirmed these artifacts and their exact
aggregate balance.

The actual upstream includes `citations: null` on ordinary text blocks. The first
parser rejected that shape; the corrected parser accepts absent, null or empty
citations and projects only `type` and `text`. Nonempty citations remain outside
the supported subset. The completed run above used the corrected binary.

An actual `openai/gpt-4.1-mini` Messages response contained the requested marker
but reported `cache_creation_input_tokens: null`. Its aggregate usage remained
unknown, no customer charge was created, and its reservation remained held across
restart and independent database reopening. The response did not expose upstream
cost metadata. This is evidence of conservative uncertainty handling, not a
settled bill or cache-price qualification.

Current-input negative checks also verified zero-credit refusal, invalid/revoked
keys, denied model grants, undeclared Messages capability, unsupported streaming,
tools and image blocks, configured output bounds, and a rule blocking native
system text. These pre-dispatch cases created no attempt. No funding receipt was
created during the run.

Release build, Clippy, SDK compilation and generated-contract checks completed.
The docs build completed, and the running docs site's generated JSON and handler
reference returned HTTP 200 with the current Messages operation. This establishes
contract serving, not a frontend visual acceptance claim. Fixture outcomes were
not used. Direct Anthropic credentials, route-pool selection, nonzero cache
categories, redaction, native client authentication, streaming/tools/media and
GenerateContent still require their own current-input qualification. Issue #16
remains open.

The same binary also ran fresh structured and streamed Chat requests against the
actual personal upstream in a separate isolated database. Exact customer debits,
key spending limits, concurrent partial-refund exclusion, replay, remainder refund
and restart preservation were checked. An independent reopen reconciled both
actual usages, charges and refunds. This checks those existing Chat/accounting
paths alongside the Messages addition; it does not qualify every legacy protocol.

### Native redaction and retained diagnostics

A subsequent fresh current-input run used native Messages with the same personal
upstream and internal verification rates. A generated private marker appeared in
both the system text block and user text block; input rules replaced both with
`[REDACTED]`. The actual response echoed the replacement. The captured native
request contained the replacement in both positions, and neither its retained
request nor returned response contained the original marker. This corroborates
inspection of the native document passed to the existing dispatch path.

After restarting the gateway, another actual generation exercised buffered output
redaction. The delivered and retained native responses contained `[REDACTED]`,
and the persisted output decision was `redacted`. The authorized retained request
continued to reflect that request's input; output redaction does not implicitly
redact historical input. Known generation usage still produced exact charges.

Both complete, untruncated payloads were identical after restart. An inference
key could not access the administrative payload endpoint, and a different
workspace could not retrieve either record. Deleting one payload removed its
content across a further restart without deleting the other payload or financial
records. A separate process reopened the stopped database and checked the deletion
tombstone, remaining request/response content, output decision, both actual usages,
exact charges/debits and absence of held reservations. This narrows the previous
unverified-redaction boundary to other unsupported content/protocol variants; it
does not qualify media, tools, native streaming or nonzero cache pricing.

### Per-key spending limit on native Messages

A fresh current-input run completed one actual native text request, then set that
key's USD spending limit to its already committed customer charge. Further
Messages requests returned HTTP 402 both before and after gateway restart, with
no additional attempt or debit. A separately issued key in the same workspace
completed another actual request while the capped key continued to be refused.
The capped key reported its exact committed amount and zero remaining allowance;
that report remained identical after another restart.

A separate verifier reopened the stopped PostgreSQL database. It matched both
actual native response usage documents to the two completed attempts, verified
one attempt per key, recomputed both customer charges and debits from the explicit
internal rates, and confirmed that only the first key had a spending-limit row.
There were no held reservations or funding receipts. This verifies the native
operation's shared per-key monetary admission path, not a new billing engine or
a claim about concurrent/rate/token limits on every native protocol.

### Machine-readable financial denials

Messages keeps the native error envelope and HTTP status. HTTP 402 uses the
native `invalid_request_error` category. Niu's shared `ApiError` response also
sets `x-niu-error-code` to its locally defined reason, preserving distinctions
such as `budget_exceeded`, `workspace_spending_limit_exceeded` and
`key_spending_limit_exceeded` across protocol conversion. The header contains no
upstream error document or credential. Framework and intermediary errors may
omit it; clients must not infer a financial cause from absence.

The JavaScript inference, administration and authentication clients share error
construction. `NiuAPIError.gatewayCode` exposes this header while preserving
status, original response body and available diagnostic references. Existing
constructor callers remain compatible. This allows frontends to handle a known
admission denial without parsing message text or treating it as a provider outage.

A fresh actual native-call run checked HTTP 402 plus `budget_exceeded` before
credit approval, and HTTP 402 plus `key_spending_limit_exceeded` at the exhausted
key cap before and after restart. The built SDK preserved the capped-request code
and native category. Its administration and authentication clients also preserved
`authentication_error` on actual unauthorized requests. Another eligible key
still completed generation. Independent database reopening matched both actual
usages, key attribution and exact debits, with no attempted dispatch from the
refused requests. The generated contract and served docs JSON/reference were
checked after rebuilding the docs artifact.


## Managed Anthropic configuration — 2026-10-11

The management API and appended migration 252 now accept `adapter: anthropic`
for Supplier API-key configurations. Set `api_base` to
`https://api.anthropic.com/v1`, use the native upstream model name, and explicitly
publish `capabilities.supports_messages: true`. Previously the Messages handler
supported Anthropic, but the stored-credential validator and database constraint
only accepted OpenAI/OpenRouter, making managed Anthropic configuration impossible.
An actual management request reproduced that HTTP 400 before the correction.

Model discovery and connection checks now use server-owned `x-api-key` and
`anthropic-version: 2023-06-01` headers, following the
[Anthropic Models API](https://platform.claude.com/docs/en/api/models/list).
They request one page of at most 1,000 entries under the existing timeout and
2 MiB response bound. Discovery rejects an incomplete or invalid pagination
indicator instead of reporting a truncated inventory as complete. A model absent
from an incomplete check page remains unknown; presence still does not qualify
inference entitlement. Display names may use the native `display_name` field.
Client authentication headers and arbitrary upstream metadata are not forwarded.

A fresh native run created the Supplier, encrypted credential, personal ownership,
model mapping and workspace key through management APIs. The credential was
intentionally invalid; no saved OpenRouter credential was sent to Anthropic.
Actual upstream model checks, catalog reads and a native Messages request were
rejected. Client errors remained sanitized, with the native Messages error envelope
and a persisted upstream refusal on its managed attempt. Unsupported streaming
and tools were rejected before additional attempts. Restart retained the adapter,
capability and exact encrypted credential revision/digest. Independent reopening
verified those records, Supplier ownership and no financial or commercial records.

A separate upgrade used a stopped database copy containing existing encrypted
credentials, 103 pools and actual charged inference records. Startup applied
migration 252; all prior migration checksums, credential identities/revisions,
mappings, pools, attempts and financial counts/sums stayed unchanged. A newly
created disabled Anthropic configuration survived restart. Independent reopening
confirmed the upgrade and retained artifacts.

These observations qualify the exercised configuration, upgrade and refusal
paths. Successful direct Anthropic generation, its successful catalog responses,
large/malformed catalog handling and native SDK compatibility remain unverified
with current real inputs. Existing actual OpenRouter Messages evidence does not
substitute for direct Anthropic qualification. GenerateContent and native
streaming/tools/media remain outside the implemented Messages subset. No fixture
outcome was used as evidence.

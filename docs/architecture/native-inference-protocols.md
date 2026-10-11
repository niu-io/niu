# Native inference protocol integration

Status: partial. `POST /v1/messages` implements native buffered text and separately
opted-in text SSE on OpenRouter and Anthropic routes. Buffered GenerateContent
text is implemented for static and managed Gemini routes. Native tools, media,
extended thinking and Gemini streaming remain unimplemented. Existing Anthropic/Bedrock
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
`stop_sequences`, and a boolean `stream` (default false). Streaming additionally
requires `supports_messages_streaming: true`. Text may be a string or text
blocks. The JSON body is limited to 64 KiB; configured conservative priced input
and output bounds also apply. Version `2023-06-01` is fixed, and beta headers,
unknown fields, tools, media and undeclared streaming fail before dispatch. Workspace key
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
substitute for direct Anthropic qualification. GenerateContent is a separate operation described below; native
streaming/tools/media were outside that Messages checkpoint. The later text SSE
implementation is described below. No fixture
outcome was used as evidence.


### OpenRouter coexistence after managed Anthropic support

A fresh isolated run on `b2a91e6` configured an intentionally invalid native
Anthropic credential and the owner's actual OpenRouter credential under one
unqualified Supplier, with distinct personal model mappings and scoped keys.
Anthropic model checks, discovery and Messages returned sanitized refusals.
OpenRouter model checks returned connected/listed with HTTP 200, its actual
catalog included the configured upstream model, and native Messages returned the
fresh requested marker. The Anthropic mapping's key could not invoke the
OpenRouter mapping: it received 404 without another attempt. Restart preserved
both adapters and their configuration identities.

Independent reopening checked the two Supplier associations, distinct attempt
bindings, saved model-check/catalog artifacts and the real native response. The
response omitted at least one cache usage category. Consequently aggregate usage
remained unknown with null prompt/completion totals on the completed attempt;
missing categories were not added as zero. The first independent verifier assumed
all cache categories were integers and stopped; correcting that assumption to
the documented unknown-usage contract required no product change or new upstream
request. Independent database inspection confirmed the retained unknown state.
There were exactly two attempts and no customer/procurement ledger entries or
reservations, consistent with the explicitly personal routes. This exercises
shared diagnostic authentication and adapter/key isolation; it does not qualify
direct Anthropic completion or known-usage charging for the OpenRouter response.
The original development database and credentials were unchanged. No fixture
outcome was used.


## Gemini GenerateContent text

`POST /v1beta/models/{model_action}` accepts a URL-encoded public alias followed
by `:generateContent`. Encode slashes within an alias; for example,
`native/gemini` becomes `native%2Fgemini:generateContent`. Authenticate with a
Niu bearer token or `x-niu-api-key`, not a Google key in the client request.
The static route must explicitly set `provider = "gemini"`,
`supports_generate_content = true`, a native model ID such as
`gemini-2.5-flash`, and `api_key_env` naming the server-side credential variable.
The default API base is `https://generativelanguage.googleapis.com/v1beta`.
The existing prepaid admission requires configured conservative route prices
and a customer tariff; an unpriced static route cannot bypass that requirement.
Managed credentials use `adapter = "gemini"`, the same native API base and the
encrypted Supplier credential lifecycle. Set `capabilities.supports_generate_content`
to true on each model mapping. Personal ownership remains isolated to its account;
shared procurement and customer tariffs retain their existing requirements.

Model diagnostics use server-side `x-goog-api-key` authentication and a bounded
1000-model page. Native `models/{id}` resource names are normalized to `{id}` for
mapping, with display names and token limits projected as descriptive metadata.
An incomplete catalog is rejected by discovery; an absent model in an incomplete
check remains unknown. Catalog metadata never automatically enables a native
capability or configures a price. The native envelope follows the
[Google Models API](https://ai.google.dev/api/models).

The implemented document contains `contents` with textual `parts`, optional
`systemInstruction`, and `generationConfig` with required positive
`maxOutputTokens`. Supported controls are single candidate, temperature, topP,
topK and up to five stop sequences. The body limit is 64 KiB. Tools, media,
cached resource references, explicit thinking configuration, structured-output
settings, unknown fields and streaming actions are rejected before dispatch.
There is no Chat translation, automatic retry or client credential forwarding.
The public catalog advertises GenerateContent separately and does not advertise
Chat or streaming for a native-only Gemini route.

Input content/system text shares local rule and detector inspection, preserving
the native body after redaction. Buffered output inspection covers projected text
parts. Endpoint validation, key/workspace limits, prepaid reservations, attempt
completion, payload retention, timing and failure diagnostics use the existing
shared pipeline. The JavaScript SDK adds `client.generateContent(alias, body)`;
its configured base URL must end in `/v1`, from which it derives the sibling
`/v1beta` endpoint while retaining the deployment prefix.

The [native usage contract](https://ai.google.dev/api/generate-content#UsageMetadata)
defines total tokens as prompt plus thoughts plus candidates. Aggregate output
uses the reported total minus reported prompt, with consistency checks against
reported candidate/thought counts. Prompt already includes cache reads. Missing
categories remain unknown rather than becoming zero or being inferred from an
unreported field. Cache-write prices are rejected before admission because this
adapter does not report that quantity. Unsupported or missing usage retains the
appropriate unresolved priced liability. The [thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
describes the output limit as including thoughts; actual bound compliance has not
been qualified here. Niu's existing overrun accounting must not hide excess usage.

Responses project one model text candidate, STOP/MAX_TOKENS, bounded response ID
and numeric usage metadata. `modelVersion` contains the public alias, not a claim
about the upstream model version; the latter may be retained in authorized request
diagnostics. Thought signatures and arbitrary upstream metadata are omitted.
This subset does not promise lossless native conversation replay. Native error
bodies contain a sanitized numeric code, status and message.

### Current-input verification and remaining scope

A fresh isolated native run exercised a static priced route whose alias contained
`/`. Actual HTTP requests verified authentication, scoped grants, missing native
capability, unsupported action/content/controls, exhausted balance, zero TPM,
input blocking and unsupported cache-write pricing. These did not cause extra
upstream dispatch. Content and system-text redaction were independently checked
against the actual retained native request in PostgreSQL.

One request used a deliberately invalid Google credential against the real
endpoint. Niu retained its upstream refusal and a native sanitized error. Because
no qualified nonexecution policy or usable usage was available, execution remained
uncertain, aggregate usage unknown and one customer reservation stayed held after
restart. No customer charge or funding entry was created. Internal verification
credit was configured through the normal management API; no payment was fabricated.
The SDK reached the native route using an encoded alias and received its expected
scoped guardrail denial without another dispatch. Public catalog flags declared
GenerateContent and excluded Chat/streaming. Independent reopening checked the
saved artifacts, exact redacted request structure, attempt/failure records and
unchanged financial state. Original development data and credentials were preserved.

Successful Google generation, success-response normalization, output redaction,
exact settled charges/category pricing, streaming and Google SDK compatibility
remain unverified. The refused real call is not evidence for those branches.
The initial run also exposed the old OpenAI-only priced-config validation, which
was extended only for explicitly declared Gemini routes. A later verifier setup
used an unpriced route under prepaid admission and correctly received 400; it was
changed to use explicit internal route/customer prices, without weakening admission.
No fixture outcome was used as evidence. This is not closure of the complete
native-protocol issue or full backend acceptance.

### Managed Gemini configuration and upgrade verification

A separate current-input run created a Supplier-linked Gemini credential and
personal model mapping through management APIs, using a deliberately invalid
Google key. A foreign account could not call the alias; incompatible Messages
capability was rejected at model creation. Actual native catalog/check and
GenerateContent requests reached Google and retained sanitized refusal states.
The single inference attempt remained linked to the correct encrypted credential.
Restart preserved adapter, model capability and credential revision/ciphertext.
Independent reopening confirmed migration 0253, Supplier ownership, the failure
artifact and zero customer/procurement financial or commercial qualification rows.
Positive Google catalog normalization and successful native output remain unverified.

An offline copy of an existing database with actual inference and charge records
was upgraded from migration 0252 to 0253. Prior migration checksums, encrypted
identities, model/pool counts, attempts, charges, balance entries and their sum
were preserved. A new disabled Gemini credential persisted after restart; an
independent reopening checked the final database against the pre-upgrade inventory.
The first verification inputs encountered an already-used credential name and
an invalid foreign-account model grant. Inputs were corrected without changing
product validation. No fixture outcome was used for these conclusions.

The shared catalog path was also exercised again with real OpenRouter discovery,
model checking and a fresh native Messages completion alongside a separate invalid
Anthropic credential. Independent artifacts preserved the selected credential,
Supplier associations and restart isolation. Missing cache categories remained
unknown; no customer charge or commercial supply claim was inferred.

### Priced Anthropic mappings

An actual management request exposed a remaining configuration mismatch: an
Anthropic mapping explicitly declaring `supports_messages` could be saved without
prices but received HTTP 400 when conservative route prices were supplied. The
native Messages handler already uses shared pricing and admission. Configuration
validation now permits priced Anthropic routes only when Messages is declared,
just as Gemini pricing requires its native GenerateContent capability. Other
non-OpenAI adapters and undeclared native capabilities retain their restrictions.

A fresh current-input run saved the exact configured rates through the management
API, rejected a priced mapping without Messages capability, and exercised empty
balance (402), unsupported reasoning pricing including an explicit zero rate
(422), and the configured output limit (400) before dispatch. After explicit
internal credit and supported customer tariffs were configured, a request reached
the real Anthropic endpoint with an intentionally invalid credential. Its refusal
was persisted on the selected Supplier credential. Usage stayed unknown and one
positive customer reservation survived restart; no charge or funding was created.
Independent database reopening checked exact stored route prices, capability,
encrypted identity, Supplier/attempt association, refusal artifact and liability.

This corrects configuration and qualifies those admission/refusal paths. It does
not establish successful direct Anthropic generation, complete category usage,
settled native charges, commercial qualification or an external payment.


### Private OpenRouter generation correlation

Canonical managed OpenRouter Messages responses now retain an allowlisted
`X-Generation-Id` header in a server-only, immutable record linked to the dispatched
managed attempt. Native message body IDs are not interchangeable with generation
IDs: an actual lookup using the `msg_` body ID returned 400, while the real response
header located a matching generation record. Client-supplied headers cannot set
this binding. A reference cannot be reassigned to another attempt or replaced
with a conflicting value. It is not exposed in customer headers, payloads or
financial responses and is separate from erasable request/response content.

Recording is bounded and best-effort; failure emits a sanitized diagnostic and
does not change execution, usage or charging. Missing/malformed headers, static
routes, custom endpoints and other native adapters do not gain an inferred
reference. This checkpoint covers the managed native Messages path; broad Chat,
Responses, streaming and failure-path correlation remain separate work.

The [OpenRouter generation metadata API](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
returns separate normalized and native token fields, plus commercial metadata.
A real query observed different values in those token families. Supplemental billing
reconciliation uses validated native quantities, validate the original
credential/route/reference binding and preserve unknown categories. Upstream costs
must not enter customer responses or substitute for customer tariffs. The original
unknown completion must remain immutable evidence; supplementing it requires an
explicit auditable transaction with exact idempotency and pinned prices.

An installation administrator can explicitly call
`POST /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation`
with `{}`. It fetches metadata using the saved reference and original credential,
requires the original enabled credential revision and exact dispatched model identity, and records
one immutable supplemental receipt containing the original execution and usage state.
The attempt's current usage projection then becomes eligible for existing financial
recovery under its bound tariffs. No inference is retried. Cache-write usage stays
unknown, and any missing category required by the bound rate prevents settlement.
The response reports recorded usage, not a guarantee of settlement; repeated calls
return the saved receipt. Customer quantities are decimal strings and no upstream
reference or commercial metadata is returned. The SDK exposes `reconcileRequestUsage`.

The metadata fetch has a ten-second total deadline and a 256 KiB body limit. Missing
or refused metadata returns a sanitized 502 without changing accounting. Mismatched
model/reference, changed credential configuration and ineligible completion return 409.
New references retain their dispatched model independently of editable mappings;
legacy references still require the unchanged enabled mapping revision.
Normalized token counts, upstream costs and inferred alias equivalence are never
billing inputs. Periodic automatic lookup and other protocol correlation remain outside this
implementation. Opted-in Messages streaming now retains the same private header.


A current-input Gateway run saved the real canonical response header despite a
forged client header, without returning it in customer headers or the native body.
The first metadata reads returned 404. A later read of the same original reference
succeeded; no replacement inference was sent. Native token totals matched the
retained response's explicit quantities, but the missing cache-write category
remained missing. The metadata reported a dated model variant rather than the
configured alias, which was recorded as an unresolved model-equivalence boundary.
Deleting request payloads and restarting twice preserved the private reference,
original unknown usage and its single hold, with no charge or funding entry.
Independent reopening checked that binding, unchanged encrypted credential,
actual metadata and payload tombstone. This validates durable correlation and a
manual read of available upstream metadata, not automatic usage correction.

An offline populated database upgrade from migration 0254 to 0255 preserved prior
migration checksums, encrypted credential identity and the existing unresolved
hold through restart. Independent reopening confirmed those values and an empty
new reference table: historical generation bindings were not invented.

## Supplemental usage current-input checkpoint

An actual Gateway Messages request configured the explicit dated model
`openai/gpt-4.1-mini-2025-04-14` and returned the fresh requested text. Its missing
native cache fields left aggregate usage unknown and the reservation open. The
installation reconciliation operation fetched the captured generation's metadata
and recorded native aggregate usage, retaining the original unknown completion
and completion timestamp. An intervening customer tariff edit did not reprice the
request: financial recovery used the bound older tariff and posted exactly one
charge and debit. Eight concurrent receipt replays, workspace-key revocation and
restart preserved that result. The receipt kept cache-write usage null.
Independent reopening compared the actual native response, original evidence,
current usage, tariff binding, exact charge/debit and released reservation.
These were internal verification rates and approved credit, not external funding,
commercial Supplier qualification or a discount claim.

A separate run queried the actual earlier undated-model generation. Its metadata
reported the dated model, so reconciliation returned 409; the original unknown
usage, open reservation and absence of financial entries survived restart. No
alias equivalence or replacement inference was invented. A populated offline
0255-to-0256 upgrade preserved migration checksums, encrypted credential identity
and the existing unknown liability; independent reopening verified those values.
This checkpoint does not establish streaming, other protocol/model equivalence,
category-priced settlement with missing quantities, or production capacity.

### Reading supplemental evidence

`GET` on the same usage-reconciliation path returns the recorded customer-safe
receipt to identities with workspace read access. Missing receipts, unknown
attempts and attempts outside the authorized workspace return 404. This read does
not query upstream, change usage or trigger settlement. The SDK exposes
`getRequestUsageReconciliation`; installation-only `POST` remains the explicit
supplementation action. A receipt remains readable after the upstream credential
is rotated or disabled. An unknown completion without a receipt cannot use that
changed credential to fetch new evidence.

Current-input checks on an isolated copy of the actual completed request exercised
company owner/admin/viewer and workspace owner/viewer identities: all could read
the receipt, and all were refused supplementation. Foreign-company, sibling-
workspace and inference-key access were rejected. The SDK read and installation
receipt replay survived credential rotation/disablement and restart. Direct
attempts to update/delete the saved receipt were rejected by its immutable trigger.
Independent reopening matched the receipt to the original native response and
confirmed one unchanged charge/debit with no new inference attempt. A separate
unknown completion refused supplementation after rotation/disablement and retained
its original unknown usage, reservation and zero financial entries through restart.
Invalid upstream quantity classification is implemented but an actual malformed
upstream metadata response has not been observed in these runs.


## Native Messages text streaming

Set both `supports_messages` and `supports_messages_streaming` on the managed
mapping or static route. The streaming flag defaults to false and cannot be
configured without Messages support. `stream: true` retains the same bounded
text request, authorization, inspection, admission and pricing rules. Required
output inspection rejects this mode before dispatch. There is no provider switch
or inference retry after response headers. The SDK exposes `messages.stream()`;
`messages.create()` remains buffered and rejects a true stream flag.

The protocol state machine follows the documented
[Messages SSE event lifecycle](https://platform.claude.com/docs/en/build-with-claude/streaming).
It checks start/block/finish order and projects only supported text event fields.
Each upstream event is limited to 64 KiB, with at most 128 sequential text blocks.
Unsupported block kinds, malformed data, premature EOF and upstream failures emit
a sanitized native error event and retain durable execution uncertainty. Arbitrary
upstream fields, including commercial metadata inside final usage, are discarded.
The public model alias replaces the upstream model in the customer start event.

Cumulative usage updates replace earlier reported values; they are not summed
across events. Aggregate input requires ordinary input, cache-read and cache-write
quantities, and output requires its reported count. Missing categories stay
unknown. Only `message_stop` confirms completion. OpenRouter's observed extra
`[DONE]` is neither forwarded nor used as additional evidence. Shared completion
writers, cancellation diagnostics and financial recovery remain the accounting
boundary; text SSE has no separate ledger or settlement engine.

### Current-input checkpoint

A direct canonical OpenRouter observation returned native start, text block,
delta and stop events, followed by an extra `[DONE]`. Its final usage included
upstream cost metadata and lacked cache-write usage. This observation established
the actual wire shape; it did not by itself verify Niu.

Subsequent isolated Gateway requests exercised the explicit dated
`openai/gpt-4.1-mini-2025-04-14` mapping under internal verification rates and
approved credit. A streaming request without the extra capability returned 501
before any attempt. After opt-in, both the HTTP stream and JavaScript SDK returned
the fresh requested text and native terminal event with customer-safe fields.
The retained payload remained readable. Missing cache-write usage left completion
known but aggregate usage unknown. Canonical supplemental metadata reconciled one
request, posting one independently calculated debit and releasing only its hold.

A real long generation was disconnected after its first text delta. Its attempt
remained `may_have_executed` with unknown usage, a cancellation diagnostic and an
open reservation; supplementation correctly refused that uncertain execution.
Restart preserved all three attempts, the single charge/debit and two open holds.
Independent reopening compared the recorded streams, SDK events, terminal timing,
original unknown evidence, exact charge and encrypted credential identity.
Fresh structured Chat streams and buffered/streamed Responses were also exercised
against the actual personal upstream after the shared completion refactor.
Independent reopening matched their stored response hashes, usage, exact charges
and debits. Required output inspection, unsupported tools, an invalid streaming-
only capability and a revoked key were refused without adding attempts or
financial records.

This does not qualify direct Anthropic streaming, nonzero native cache pricing,
malformed upstream event delivery, streaming tools/media/thinking, native SDKs
other than the Niu SDK, or production capacity. No commercial Supplier agreement,
funding receipt or fixture outcome was used to establish this checkpoint.


### Recovering a lost local completion record

Canonical terminal evidence can also recover an attempt whose execution remains
`may_have_executed` and whose aggregate usage is unknown. The same original
credential revision, exact dispatched model and saved generation reference
are required. Metadata must explicitly report `cancelled: false` and a `stop` or
`length` finish reason. Cancelled and nonterminal generations remain unresolved.

New receipts use `openrouter-native-generation-v2` and expose
`original_execution`, `upstream_finish_reason` and `upstream_cancelled`. They
atomically preserve the original state before confirming execution and usage.
Existing delivery failures and timing are retained. If local completion time was
absent, `completed_at` records reconciliation confirmation time, not an invented
upstream timestamp. Legacy v1 receipts return null terminal fields; migration 0257
does not invent historical evidence. Existing financial recovery still owns
settlement against the request's bound prices.

An actual native streaming request returned a fresh marker and terminal event
while an isolated database fault rejected its completion write. After restart,
execution remained uncertain with one hold and no charge. Reconciliation under
the same fault rolled back its receipt and usage update together. After removing
the fault, eight concurrent reconciliation calls returned one receipt despite key
revocation and a later tenfold tariff edit. Independent reopening matched the
saved SSE quantities, original uncertain state, pinned old tariff and exactly one
charge/debit; the hold was released and replay after restart added nothing.

A populated 0256-to-0257 upgrade preserved the legacy receipt, historical migration
checksums, encrypted credentials and financial records. Actual cancelled-generation
metadata was refused, preserving its failure and unresolved hold. Independent
reopening confirmed those artifacts. Recovery of a client-disconnected generation
that subsequently completes without upstream cancellation remains unverified.


### Historical usage after model mapping edits

Migration 0258 adds the dispatched upstream model to newly captured immutable
OpenRouter generation references. The value comes from the server-side resolved
route actually sent upstream, not the current registry or a client-supplied field.
Supplemental usage compares canonical metadata against this retained identity.
Later mapping edits, including capability revocation or a different upstream model,
do not replace that evidence or the attempt's bound prices. The original Supplier
credential must still be enabled at its dispatched revision; credential rotation
or endpoint changes remain unresolved. This does not retain old plaintext secrets
or authorize sending inference again.

Older references keep a null model binding. They still require the unchanged,
enabled model mapping and original credential revision. Migration does not infer
historical identity from today's registry. The retained model and generation
reference are server-only and absent from customer receipt responses.

A fresh actual native stream returned its unique marker while management changed
the selected mapping to a different upstream model and disabled streaming.
Independent persisted timestamps placed the edit between dispatch and completion.
Subsequent stream requests were rejected before dispatch across restart. The
historical request reconciled against its saved original model, then posted exactly
one charge/debit and released its hold. Replay after restart added nothing.
Independent reopening matched the raw SSE quantities, original unknown usage,
immutable model binding, original price calculation and final ledger entries.

A populated 0257-to-0258 upgrade separately preserved an older real generation
reference with a null model binding, original migration checksums, encrypted
credential and unresolved hold. Its edited mapping still produced 409 after
restart. Independent reopening confirmed no invented receipt or charge. These
are personal upstream calls with internal verification credit/prices, not evidence
of merchant funding or commercial supply. Cross-credential recovery and automatic
periodic metadata lookup remain outside this implementation.


A separate fresh actual stream then exercised credential revocation with the new
model binding present. Rotating only the isolated Supplier credential caused
reconciliation to return 409 before and after restart. Independent reopening
confirmed the original immutable model identity, the older dispatched credential
revision, one unknown completion and hold, and no receipt, charge or debit. The
new binding therefore does not relax the original-credential boundary.


### Reconciliation confirmation is not generation latency

Request detail and request-list `duration_ms` remain null when supplemental
evidence first established completion after the original local completion write
was lost. In that case `completed_at` is the reconciliation confirmation time;
subtracting dispatch time would incorrectly count the reconciliation delay as
model latency. The immutable receipt preserves the original missing timestamp.
`timing` remains the independently observed delivery measurement; callers must
respect its `complete` flag. Normal locally observed completion intervals are
unchanged, including when only usage was supplemented later.

Actual API reads on an isolated copy of a previously completed real request
reproduced an inflated legacy interval relative to its retained delivery timing.
On the corrected gateway, detail and list returned null legacy duration while
preserving complete measured timing and the exact customer charge through restart.
A second copy with an original local completion timestamp retained its known
legacy duration. Independent reopening compared both API artifacts with original
receipt timestamps, timing rows and single charge/debit records; none of those
stored records changed. These reads use actual upstream-request artifacts, not
fixture results or an inference-performance benchmark.


### Native client-tool lifecycle prerequisite observation

Native Messages tools remain unsupported by Niu. A direct current-input canonical
OpenRouter observation used the dated mini model and a client-defined
`sha256_text` tool with an object input schema. The first request forced that tool;
the response contained one `tool_use` block and native `stop_reason: tool_use`.
The client computed SHA-256 from the actual returned UTF-8 argument and sent a
matching `tool_result` in the next user message. With automatic tool choice, the
second response returned the independently computed digest and `end_turn`.
This follows the [native client-tool lifecycle](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).

Independent inspection of the retained original requests and responses verified
the fresh input, tool name, argument, call/result identity, computed digest and
final answer. Canonical metadata for the same two generation references matched
the configured model and reported noncancelled execution. Its normalized finish
reason was `tool_calls` for the first turn and `stop` for the continuation; the
provider-native reason was `completed` for both. Native prompt/output counts
matched the corresponding response quantities (100/23 and 161/34). No Niu
attempt, customer charge, Supplier qualification or supported Niu tool capability
is inferred from this direct provider observation.

Implementation must cover these boundaries together:

- Explicit native tool capability and candidate filtering, independent of the
  existing text-streaming opt-in; do not silently enable unsupported stream events.
- Bounded tool definitions, choices and object inputs, plus matching tool-use and
  tool-result history. Niu transports client-owned tools; it does not execute them.
- Response projection and tool identity/argument validation without forwarding
  arbitrary upstream metadata. Schema handling must remain offline and bounded.
- Input/output inspection of tool definitions, arguments and results, or an
  explicit pre-dispatch rejection when an installed policy cannot inspect them.
  The current text-only inspection path is insufficient for this extension.
- Durable completion/finish evidence and exact accounting for the tool-producing
  turn as well as the continuation. The current supplemental metadata parser and
  immutable receipt constraint exclude `tool_calls`; these must be deliberately
  extended with the native tool path rather than accepting unknown finish reasons.
- Actual workspace-key round trips, permissions, interruption/restart and
  independent ledger verification before claiming backend support. Direct
  provider compatibility alone does not establish those outcomes.

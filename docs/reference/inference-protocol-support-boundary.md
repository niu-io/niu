# Finite inference protocol support boundary

This record defines the S03-2 matrix without making external account activation a backend readiness requirement. The supported public protocols, their finite implemented modes and actual qualified combinations are separate facts. An implemented adapter is not a claim that every upstream account or optional feature has been exercised.

## Public contract and available execution evidence

| Protocol | Committed Niu endpoint and implemented scope | Actual qualified combination |
| --- | --- | --- |
| Chat Completions | `POST /v1/chat/completions`; buffered and streaming. Tools, structured output and inspection are separately gated capabilities. | Personal OpenRouter GPT-4.1 Mini, buffered plain text and terminal `[DONE]` streaming. |
| Responses | `POST /v1/responses`; buffered or streaming text, with explicit Responses capability. Multimodal input, tools and prior-response state are outside this finite scope. | The same personal OpenRouter model; buffered completion and streaming terminal `response.completed`. |
| Embeddings | `POST /v1/embeddings`; explicitly enabled embedding routes, bounded batch, float or separately enabled base64 and dimensions. | OpenRouter text-embedding-3-small: two indexed 1536-dimensional float vectors; a separate two-input base64 request independently decoded into 32 finite floats per vector. |
| Messages | `POST /v1/messages`; native Messages shape on an explicitly enabled OpenRouter or Anthropic adapter. Buffered/streaming and tools have independent capability flags. | Personal OpenRouter buffered text and streaming terminal `message_stop`; no direct Anthropic account activation is inferred. |
| GenerateContent | `POST /v1beta/models/{model_action}` with `:generateContent`; explicitly enabled Gemini adapter, bounded nonstreaming text and `generationConfig.maxOutputTokens`. | Positive native Gemini execution is unverified. Wrong-adapter and unsupported streaming-action refusals are genuinely verified. This is an implemented integration boundary, not a promised externally activated account. |

The [actual protocol checkpoint](inference-protocol-acceptance-matrix.md) contains eight genuine execution cases and their independent response/native/accounting checks at runtime `1212ea3b68f934c22fff6c62696475d2f628fc6a`, schema 284. It also records the three disabled-capability refusals. The dedicated native GenerateContent refusal checkpoint uses that same runtime and verifies the correct registered route; preliminary generic 404 probes are excluded.

Messages initially omitted a billable usage category. The existing reconciliation interface recovered canonical records for those same two generations without another generation, preserved missing categories as null and produced exactly one charge/debit per attempt. This qualifies the enumerated missing-usage recovery path, not an assumption that every successful HTTP response has complete usage.

## Explicit unsupported boundaries

| Boundary | Implementation and evidence |
| --- | --- |
| Responses, Embeddings or Messages capability absent | Actual 501 before a new dispatch or debit in the retained checkpoint. |
| GenerateContent on the OpenRouter adapter | Actual native 501 `UNIMPLEMENTED` on `/v1beta/models/{model_action}` before dispatch. |
| `:streamGenerateContent` | Actual native 501; no streaming capability is claimed. |
| GenerateContent tools, media, cached content or thinking configuration | Committed validator rejects these documents before dispatch. These individual document variants have not each received an actual HTTP probe in the retained checkpoint. |
| Direct Anthropic or Gemini positive execution | Mechanism implemented, real working external account combination unverified. No fake endpoint, account or credential is substituted. |
| Optional tools, structured output, caching, reasoning or media | Their separate capability/evidence records apply. Plain-text success does not qualify these combinations. |

The JavaScript SDK exposes the registered protocol paths. A public alias containing slashes must be URL-encoded inside GenerateContent's model-action path. Pending local edits to Gemini handlers/routes are outside this committed-source assessment and have not been silently included as a supported alias.

## Source continuity and evidence age

The source comparison was against committed revision `2aa81340d65632b3611694171a7ad0f1c9a2ad16`, not uncommitted working-tree changes. Relative to the executed `1212ea3b` pin, the Messages, Embeddings and GenerateContent handler executable changes are limited to the configured timeout-aware client factory. Their protocol validation, auth selection and response projection remain unchanged. Chat and Responses additionally wire the separately documented streaming output-policy and observation paths; their older plain-text executions are not presented as fresh tests of those new facilities.

Shared admission, runtime configuration and transport have also evolved. Source continuity supports retaining the accurately pinned historical cases; it does not manufacture current-runtime end-to-end proof. The retained binaries and saved response digests for the positive matrix, native negative matrix and canonical Messages reconciliation were independently rechecked during this consolidation. No new generation or fixture result was used.

OpenRouter's [official Messages gateway guidance](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration) specifies Bearer authentication. Niu's OpenRouter Messages branch uses that authentication with `api_base=https://openrouter.ai/api/v1`, appending `/messages`. Its Anthropic branch uses `x-api-key`. Moving an OpenRouter key into that branch would not provide documented direct-Anthropic evidence and is not proposed as a substitute.

## Completion recommendation

The finite publication and qualification criterion can be closed for this declared matrix: supported mechanisms, genuinely working combinations and unsupported/refused combinations are explicit and linked to their bounded evidence. Real external Anthropic/Gemini activation and optional-feature coverage remain unverified entries, not prerequisites silently added to S03-2. This recommendation does not mark the whole backend or every adapter as production-qualified.

No additional paid generation is required to publish this boundary. If a fresh current-runtime rejection checkpoint is desired, the bounded next run is zero-generation: replay the disabled Responses/Embeddings/Messages capability cases and the native GenerateContent wrong-adapter/streaming-action cases on a stopped database copy, independently verifying no new attempt, dispatch, hold or charge. It must use the committed routes and an explicit retained runtime pin; source inspection alone must not be relabeled as that run.

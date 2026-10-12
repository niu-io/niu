# Inference protocol acceptance matrix

This is the finite S03-2 protocol matrix. Registered/implemented behavior, actual working combinations and independently checked rejection are separate states. It does not assert conformance for every Provider or every optional model feature.

The current run uses native Gateway `1212ea3b68f934c22fff6c62696475d2f628fc6a` and PostgreSQL schema 284 after migration of stopped isolated copies. It uses the saved personal self-funded OpenRouter credential, an API-created private model mapping, existing approved verification credit and the previously saved internal tariff rates. It creates no funding receipt, commercial Supplier agreement or qualification. Each text request has a 32-token output bound; the configured admission ceiling is 64 output and 2048 input tokens. No original database, configuration or encryption identity is changed.

## Working combinations

| Customer protocol | Declared route mechanism | Actual current-input result |
| --- | --- | --- |
| `POST /v1/chat/completions`, buffered text | OpenAI-compatible route | Personal OpenRouter GPT-4.1 Mini: 200, fresh response marker, reported usage and exact debit |
| Same endpoint, streaming text | OpenAI-compatible streaming route | 200, fresh marker, complete SSE with `[DONE]`, reported usage and exact debit |
| `POST /v1/responses`, buffered text | OpenAI-compatible route with `supports_responses` | 200, fresh marker and completed response, reported usage and exact debit |
| Same endpoint, streaming text | Same explicit Responses capability | 200, terminal `response.completed`, fresh marker, reported usage and exact debit |
| `POST /v1/embeddings`, two-input float batch | Explicit `supports_embeddings` | OpenRouter text-embedding-3-small: 200, two distinct indexed finite vectors of length 1536 and exact reported input-token debit |
| Same endpoint, base64 batch with `dimensions: 32` | Separate base64 and dimensions capabilities | 200, two distinct base64 vectors independently decoded as 32 finite little-endian floats; exact reported input-token debit |
| `POST /v1/messages`, buffered text | Explicit Messages capability on OpenRouter | 200, fresh marker; initial missing cache-creation quantity is preserved as unknown, then real canonical generation receipt recovers aggregate usage and exact debit |
| Same endpoint, streaming text | Separate Messages-streaming capability | 200, fresh marker and terminal `message_stop`; the same explicit unknown-to-canonical-reconciliation lifecycle |

These eight calls verify these concrete OpenRouter models and modes. Tool turns, structured schemas, image/audio input, caching, reasoning and other optional combinations retain their separate capability/evidence records; this table does not relabel them as tested by plain-text calls. OpenAI-compatible adapter compatibility is an implementation mechanism, not conformance evidence for arbitrary upstream services.

## Explicit rejection and unverified mechanisms

| Case | Status | Actual evidence / limitation |
| --- | --- | --- |
| Responses without its explicit capability | Rejected | Current HTTP 501 before new durable attempt or debit |
| Embeddings without embedding capability | Rejected | Current HTTP 501 before new durable attempt or debit |
| Messages without Messages capability | Rejected | Current HTTP 501 before new durable attempt or debit |
| GenerateContent requested on the OpenRouter route | Rejected | Correct native `/v1beta/models/{model_action}` route returns 501 with native `UNIMPLEMENTED` error, before new attempt or debit |
| `:streamGenerateContent` action | Unsupported and rejected | Same current native route returns 501 before dispatch |
| Direct Anthropic buffered/streaming Messages | Implemented mechanism; working call unverified | No genuine direct Anthropic credential available in the saved test configuration. OpenRouter Messages success does not qualify direct Anthropic |
| Direct Gemini buffered text GenerateContent | Implemented mechanism; working call unverified | Requires a genuine Gemini credential and explicit native capability. Current implementation accepts bounded text with `generationConfig.maxOutputTokens`; no genuine working upstream call is asserted |
| GenerateContent tools, media, cached content or thinking configuration | Declared unsupported | Handler rejects unsupported documents before dispatch; these particular document variants are not independently qualified by the current two rejection calls |

The committed native GenerateContent path is `/v1beta/models/{model_action}`. A separate pending worktree route change must not be mistaken for the executed contract. Early verification probes at `/v1/models/...` received generic 404 responses; those are excluded from the native GenerateContent rejection evidence.

## Accounting and final artifacts

Six initial known-usage calls produce exactly 41,236 customer-charge nanounits. The two native Messages responses initially omit cache-creation quantity: each is saved with unknown aggregate usage and one bounded priced hold, without a guessed charge.

The existing administration reconciliation API obtains real canonical OpenRouter generation records for those two already executed requests. Aggregate counts are 16 input/7 output tokens and 15 input/6 output tokens. Independent native tariff/debit verification gives supplemental charges of 8,889 and 7,778 nanounits. The saved canonical receipts survive repeat requests and restart, with exactly one native reconciliation record, charge and debit per attempt. Missing cache-creation quantity remains null rather than being inferred as zero; the flat frozen tariff can charge the independently reported aggregate.

The final database retains the original four calls and adds exactly eight generations: twelve attempts and twelve charges totaling 132,227 nanounits, equal to the negative charge-ledger total. There are no open holds or funding receipts. Non-target attempt/financial rows match their source fingerprints. Capturing a native row immediately after receipt acceptance can precede background charge recording; the independently reopened final state, not that transient snapshot, establishes completion.

Independent verification checks saved raw response hashes, fresh markers, SSE terminals, vector dimensions/finite values, reported usage, frozen tariff bindings, exact charges and ledger entries. All eight current attempts are also checked through actual Logs/detail responses, operation associations and CSV/summary projection. Initial unknown Messages rows and final reconciled rows agree with the corresponding native states. Recursive customer-response/report checks exclude Supplier expenses, procurement prices and platform margins. Verification keys and reporting members are revoked; the copies are stopped.

## S03-2 status

The finite matrix is published, with the eight available personal OpenRouter combinations and five correct capability/action refusals independently verified. Direct Anthropic and Gemini working combinations remain unverified, so this record does not close the full fixed S03-2 criterion or infer external success from implementation/configuration alone. External merchant activation and commercial Supplier qualification are not requirements for these protocol integration mechanisms.

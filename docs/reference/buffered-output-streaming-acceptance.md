# Buffered output streaming acceptance

This extends [default output capture acceptance](output-default-capture-acceptance.md) and [buffered output policy execution](buffered-output-policy-execution.md). Required local `buffered_full` rules now support the exercised plain-text Chat and Responses streaming paths. This evidence does not close the complete [Guardrails acceptance matrix](guardrails-acceptance-matrix.md) or S04-3.

The actual clean Gateway binary is `50ff308d85ee2fc6644764d4e514e036ce205bee`, with its retained SHA independently checked. Reopening the stopped final PostgreSQL copy confirms migration 287 and successful migration flags. An isolated copy uses the saved personal self-funded OpenRouter route, existing approved internal credit and frozen customer tariffs. Original configuration, database and encryption identity remain unchanged. No cash receipt, commercial Supplier qualification or external detector is created.

## Actual streaming executions

Exactly four actual generations request upstream streaming with a maximum output limit of 32 tokens. There are no generation retries. The requests omit `x-niu-log-payloads`, exercising default capture.

| Request | Output action | Initial HTTP status | Reported input / output tokens | Customer charge, nanounits |
| --- | --- | ---: | --- | ---: |
| Chat stream | Block | 200 | 19 / 10 | 12,223 |
| Chat stream | Redact | 200 | 18 / 9 | 11,112 |
| Responses stream | Block | 200 | 19 / 10 | 12,223 |
| Responses stream | Redact | 200 | 20 / 11 | 13,334 |

The total new customer charge is **48,892 nanounits**. All four attempts are `confirmed_completed`, with `provider_reported` quantities and no open customer hold. A policy refusal changes delivery, not the charge for the completed generation.

Both blocked streams deliver only a safe SSE error with `error.type = guardrail_output_withheld` and `error.code = 403`. Their initial transport status remains HTTP 200. Neither delivers generated content, a Chat `[DONE]`, or a successful Responses terminal event. Consumers must read stream events rather than treat the initial HTTP status as final success.

The redacted Chat stream returns compatible role/content deltas, a finish reason, original reported usage and `[DONE]`. The redacted Responses stream returns its ordered lifecycle with continuous sequence numbers, preserved item/content indices, filtered text and a successful terminal response. Independently assembled text deltas equal terminal text; terminal usage equals native quantities. The fresh generated markers are absent, and actual `[REDACTED]` text is present.

## Capture and independent verification

For each request, the native captured request equals the submitted JSON. Its fresh marker was supplied by the user and remains in that legitimate input capture. Neither the delivered filtered response nor response capture contains the withheld marker. Captured response bytes equal the final delivered SSE bytes exactly, with complete and untruncated capture. Workspace payload reads remain identical after Gateway restart. Payload storage is bounded plain JSON/text, not ciphertext.

The independent verifier reopens both source and final stopped databases. It directly reads final execution state, usage confidence, token quantities, charge amount, debit amount, charge/debit cardinality, unreleased reservations and immutable output decisions. These actual final values match the producer observations. Each attempt has exactly one customer charge and one matching negative ledger entry; recomputation from its frozen tariff gives the recorded amount. Native inspected bindings retain the exact policy revision used by each request.

All original financial rows retain their fingerprints. Complete funding-receipt, Provider configuration and model fingerprints also remain unchanged. Safe diagnostics contain neither fresh markers nor procurement fields. Three existing Provider credential ciphertexts decrypt under the preserved encryption identity; those credentials are absent from customer responses, captures and diagnostics. The temporary verification key is revoked, and copied Gateway/PostgreSQL processes are stopped.

## Implemented limits and remaining qualification

The implementation retains required output until terminal protocol evidence and its durable policy decision are handled. It reuses the existing SSE parser, customer projection, usage evidence and completion coordinator. It does not convert the upstream request into a nonstreaming request or create a second accounting completion.

Collection has a 1 MiB text bound, a 2 MiB total incoming-event bound and four shared collection permits acquired before dispatch without waiting. Filtered JSON and replay serialization are bounded again: 1 MiB filtered JSON, 2 MiB total replay, and an explicit 64 KiB bound per Chat replay frame. These are implementation limits, not performance or saturation qualification. Required inspection cannot silently fall back to partial or windowed release.

The CR-terminal observer fix and explicit per-frame replay bound received static implementation checks. The actual upstream streams in this run do not qualify every CR framing variant or limit boundary. Cancellation, collector saturation/overflow, observation-mode streaming, tool-output inspection and external-detector success are not established here. Ordinary streams without required rules retain their existing path; unsupported combinations remain explicitly classified. Frontend UI behavior and the remaining S04-3 paths require separate evidence.

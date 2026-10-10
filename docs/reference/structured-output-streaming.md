# Structured Chat streaming

OpenAI-compatible routes with `supports_structured_output` enabled accept
`stream: true` with `response_format.type` equal to `json_object` or
`json_schema`. Public and dashboard Chat use the same execution path. Tools
combined with structured output and native Anthropic/Bedrock structured routes
remain unsupported. Endpoint compatibility still requires verification;
[OpenRouter documents streaming support](https://openrouter.ai/docs/guides/features/structured-outputs)
but describes provider-specific schema enforcement differences.

## Delivery and accounting

Content deltas are provisional. Niu accumulates at most 1 MiB of content and
refusal bytes across at most 128 choices, requires finished choices, and checks
assembled JSON before releasing `[DONE]`. JSON-object mode requires an object;
schema mode uses the same offline, bounded schema compiler as buffered Chat.
Explicit nonempty model refusals remain refusals rather than fabricated JSON.
This is terminal validation, not a guarantee that every partial delta is a valid
JSON document or that already delivered content can be recalled.

Invalid final content produces an `upstream_invalid_response` SSE error with
code 502 and no `[DONE]`. The HTTP stream may already have started with 200.
Sanitized final usage remains available when reported. A durable content-free
failure record distinguishes delivery failure from execution: valid terminal
usage still completes accounting exactly once. Missing or conflicting usage
remains unknown; disconnects and absent terminal evidence retain the existing
uncertainty behavior. Niu does not retry generation to repair JSON.

## Current-input verification, 2026-10-10

An isolated native PostgreSQL database and current gateway binary used the saved
personal OpenRouter credential with internally configured verification prices
and approved credit, without creating merchant funding or a commercial offer.

- Actual streamed `json_schema` output matched a fresh marker schema. After a
  gateway restart, actual streamed `json_object` output matched the requested
  marker object. Both delivered terminal markers and reported usage. Independent
  arithmetic matched customer charges, balance debits and configured expenses;
  holds were released. Key-cap denial, invoice settlement, idempotent refund and
  another restart retained the expected records without duplicate charges.
- An actual JSON-object request for a larger document with a small token limit
  returned incomplete JSON. The client received usage and an explicit SSE error,
  without `[DONE]`. Independent usage-based arithmetic matched one customer debit;
  the attempt remained confirmed completed with an `upstream_invalid_response`
  diagnostic. No active balance hold remained. Restart retained the same charge,
  usage and diagnostic and did not insert a second debit.
- Separate strict-schema requests returned a complete object despite a requested
  one-token output limit. This upstream observation does not establish a hard
  output bound. Niu continues to account for reported usage rather than truncate
  the charge to the requested maximum.

These runs do not qualify multi-choice streaming, refusals, the 1 MiB boundary,
all schema features, arbitrary providers, every disconnect timing, or production
load capacity. Later checkpoints below cover specific load and disconnect paths. No fixture outcome is used as
integrated evidence. Original development data and encrypted identity were
preserved; temporary gateways and databases were stopped.

## Concurrent longer-output checkpoint

Eight current-input schema streams ran through four workers with an eight-
connection database pool. Each schema required a fresh marker and an integer
array; independent response inspection required exactly the integers 1 through
200, in order, plus the matching marker and `[DONE]`.

| Measurement | Observed value |
| --- | --- |
| Total elapsed time | 9.825 seconds |
| Completed requests per second | 0.814 |
| Completion latency P50 / P95 | 3.929 / 5.353 seconds |
| First content latency P50 / P95 | 0.803 / 2.272 seconds |
| Sampled maximum gateway RSS | 26,384 KiB |
| Sampled maximum gateway CPU | 5.6% |

All eight actual outputs matched the requested documents. Independent arithmetic
from each response's usage matched its customer charge and balance debit; their
sum was 3,339,386 internal USD nanounits. No balance reservation remained active,
reconciliation totals matched and restart retained exactly eight charges and
eight debits. These are application observations including real upstream latency,
not a gateway-only benchmark, memory bound, sustained-load result or capacity
claim. One-second process samples can miss short peaks.

## Existing native runtime checkpoint

The development gateway was gracefully replaced using the previous process's
exact environment and the current built backend. Original configuration files,
Supplier credential ciphertext/revisions and the existing counts of companies,
workspaces, video jobs and financial entries were independently unchanged across
replacement. The ready endpoint returned 200. A fresh model-scoped temporary key
then made an actual structured stream through the existing personal route: its
fresh marker, terminal usage and saved attempt agreed, and no customer charge was
created. The temporary key was revoked. This is a native backend checkpoint;
frontend and packaged deployment qualification remain separate.

## One-minute structured-stream load checkpoint

On 2026-10-10, the backend built from `9fa9ea8` ran four sequential-request
workers against an isolated native PostgreSQL instance with an eight-connection
pool. Workers admitted new requests for 60 seconds and then drained in-flight
responses, with an independent ceiling of 30 requests per worker. No retries or
warm-up calls were included. This used the saved personal OpenRouter credential,
`openai/gpt-4.1-mini`, private verification rates and administrator-approved
credit, without merchant funding, public supply or a commercial offer.

Every request required a new marker and exactly the integers 1 through 200 in
ascending order, with a 1,024-token requested output limit. All 71 actual responses
contained the expected complete JSON document, reported usage and `[DONE]`.
Reported input usage ranged from 74 to 85 tokens and output from 411 to 416.

| Measurement | Observation |
| --- | ---: |
| Workers / completed requests | 4 / 71 |
| Total time including drain | 63.630 seconds |
| Completed requests per second | 1.116 |
| Completion P50 / P95 / maximum | 3.262 / 4.947 / 9.753 seconds |
| First content P50 / P95 | 0.751 / 1.336 seconds |
| Gateway RSS across 63 one-second samples | 22,448–26,928 KiB |
| Maximum sampled process CPU | 8.2% |

Independent integer arithmetic used each response's reported input/output usage
and the pinned customer rates of 123,456,789 / 987,654,321 USD nanounits per million
tokens, rounding the combined charge upward once. Each of the 71 customer charges
and corresponding balance debits matched. Their total was 29,619,043 internal
USD nanounits; this is not an upstream invoice or claimed market price. No active
reservation remained, reconciliation had no missing/mismatched/duplicate source,
and all 71 saved timing records were complete. No request failure or database
deadlock diagnostic was recorded. Gateway restart preserved the same 71 charges
and debits. Temporary credentials were revoked and isolated processes stopped;
the original development database and encrypted credential identity were retained.

The private artifacts retain each response digest, actual usage, latency,
financial comparison, process sample and binary hash. This extends the measured
workload beyond the earlier eight-request burst. It remains a single short run,
not a production concurrency limit, long soak, gateway-only overhead measurement,
or qualification of overload, slow readers, large inputs or multiple instances.


## Interrupted structured stream and retained liability

A current native run requested strict structured JSON containing a fresh marker
and a long integer sequence through the actual personal OpenRouter route. The
client received the first nonempty content delta and then closed the response
before terminal usage. The run used isolated PostgreSQL, configured internal
customer rates and approved credit; no funding receipt or commercial offer was
created.

Independent HTTP and database observations established one attempt with
`may_have_executed` execution and unknown usage. Customer request detail retained
null token counts and a pending, null charge rather than treating partial JSON as
complete output. No customer charge or balance debit was inserted. One reservation
of 758,519 USD nanounits remained, matching the configured 2,048-input/512-output
liability and exact internal rates. This bound is not a measurement of actual
upstream consumption.

The selected key's cap equaled that reservation. Another request returned 402
without creating an attempt, both before and after key rotation. The old secret
returned 401. Gateway restart retained the same unknown attempt and reservation;
recovery ticks did not invent usage or release capacity. Revoking the replacement
key also retained the existing liability. The original database and credential
identity were preserved, and isolated processes were stopped.

This qualifies the exercised first-content disconnect, cap and restart path.
It does not prove upstream cancellation, recover missing usage, settle the
unknown charge, or qualify every disconnect timing and transport buffering mode.

## Operation-tariff concurrency checkpoint

The same bounded four-worker, 60-second workload ran against `3f474d2`, including
migration 0223's immutable operation tariff binding. It completed 70 actual
structured streams in 63.256 seconds including drain (1.107 completions/second).
Every output contained its fresh marker and the complete requested integer
sequence, with reported usage and terminal completion. No retry was requested.

| Measurement | Observation |
| --- | ---: |
| Completion P50 / P95 / maximum | 3.418 / 4.319 / 5.694 seconds |
| First content P50 / P95 | 0.756 / 1.298 seconds |
| Gateway RSS across 63 samples | 22,784–28,224 KiB |
| Maximum sampled process CPU | 6.7% |

Independent database reads found 70 operation tariff bindings, each matching its
attempt tariff. Exact usage-based arithmetic matched all 70 customer charges and
debits, totaling 29,228,918 internal USD nanounits. No customer balance hold remained;
reconciliation had no discrepancy, all saved timings were complete and no request
failure or database deadlock diagnostic was recorded. Restart preserved the same
charges and debits. Temporary credentials were revoked and isolated processes
stopped; original development data and encrypted identity remained unchanged.

This is one short real-upstream observation with the operation binding enabled.
Differences from the earlier run cannot isolate the cost of that binding: upstream
and network conditions were not controlled. It does not qualify maximum capacity,
same-operation successor contention, long soaks, overload or multiple instances.

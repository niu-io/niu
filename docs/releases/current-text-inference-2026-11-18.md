# Current hosted text inference — 2026-11-18

Bead: `niu-nrcn.4`. Hosted core: `9fd281e523cdbd521585a0a8f98d605d5d5a1073`.
This is current-input API evidence, not final-candidate release acceptance.

The previously packaged SDK was exercised outside the checkout against staging.
Its tarball SHA-256 is
`84d17615b0818d94f9f7bbc652ddb23dbc7dc13018d368525d09538f773a67e1`;
[the packaging record](packaged-client-discovery-verification-2026-11-18.md)
describes its source and scope. The harness source revision was `ac6d6fb5`.

A fresh 15-minute key allowed only `qiniu/deepseek-v4.1-flash`. Before inference,
an independent key read confirmed a USD zero spending cap and model discovery
confirmed zero current customer prompt, completion, minimum and request rates.
The run used fresh prompts containing a unique marker, without retries.

| Operation | Actual result | Independent persisted result |
| --- | --- | --- |
| Nonstream chat | HTTP 200; exact current marker | Confirmed completed; Provider-reported 41 input and 19 output tokens; customer charge USD 0 |
| Streaming chat | HTTP 200; exact stream marker and terminal stop | Confirmed completed; Provider-reported 44 input and 27 output tokens; customer charge USD 0 |
| Tool call | HTTP 200; one requested function and exact marker argument | Confirmed completed; Provider-reported 316 input and 70 output tokens; customer charge USD 0 |
| Stream cancellation | First content received; client aborted before a terminal event | `response_stream_cancelled`; may have executed; unknown usage; not charged; null amount |
| Embeddings on this model | HTTP 501 with explicit unsupported-operation message | No successful operation claimed |
| Responses on this model | HTTP 501 with explicit unsupported-operation message | No successful operation claimed |

The SDK generation reads were followed by a separate administrative HTTP inventory
after key revocation. It contained exactly four inference records, matching the
three completed operations and one cancelled stream. This confirms persisted
request observations; it does not establish saved Chat message persistence or
exactly-once behavior under arbitrary retries. Cancellation does not prove that
the Provider stopped work or incurred no upstream expense.

The temporary key was revoked with HTTP 204, then independently denied with HTTP
401. Its token was removed from the local verification record. No paid video
request or payment checkout was made in this run. Zero customer charges do not
qualify positive-charge accounting or real settlement.

## Remaining evidence limits

The earlier `qiniu/conatus-free` attempt returned upstream HTTP 429 and remains
unresolved. Read-only incident inspection of the configured Qiniu connections
returned no qualified incidents; that absence does not explain the 429 or prove
availability. Success on another configured model does not close that finding.

The broader acceptance case still needs the final candidate, rendered Chat flows,
saved responses and reload/export inspection, applicable supported attachments,
and duplicate-prevention scope. This record does not claim native client-host
qualification or final published artifact verification. No fixture-test outcome
is used as evidence.

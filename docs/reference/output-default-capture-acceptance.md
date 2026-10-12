# Default output capture acceptance

This supplements [buffered output policy execution](buffered-output-policy-execution.md) and the [Guardrails acceptance matrix](guardrails-acceptance-matrix.md). It verifies default capture and five preparation refusals; S04-3 remains active.

The actual Gateway binary is pinned to `13952e57ddde7c8aad3d16c4ddf8361191fda97a`. Independent reopening of the stopped final PostgreSQL copy confirms migration 287 and successful migration flags. The binary SHA is checked against the retained build pointer. Execution uses the saved personal self-funded OpenRouter route, existing approved internal credit and frozen customer tariff in an isolated copy. No cash receipt, commercial qualification or external detector is created.

## Preparation refusals

Five actual Chat requests with nonempty output rules return HTTP 403, `error.type = guardrail_denied`. Native preparation records retain reason `output_incompatible`:

| Configured output mode | Requested combination |
| --- | --- |
| `buffered_full`, block | Streaming text |
| `buffered_full`, redact | Streaming text |
| `observe_only`, block | Streaming text |
| `buffered_full`, block | Function tools |
| `buffered_full`, block | Structured JSON output |

Each refusal creates no attempt or dispatch and leaves the financial fingerprints unchanged. These are unsupported combinations refused safely, not successful streamed or tool-output inspection. Observation mode also rejects the exercised streaming combination.

## Default capture execution

Exactly three actual generations use a maximum output limit of 32 tokens. None sets `x-niu-log-payloads`; the default applies. No generation is retried.

| Request and output policy | Delivered result | Reported input / output tokens | Customer charge, nanounits |
| --- | --- | --- | ---: |
| Buffered Chat, local block | 403, `guardrail_output_withheld` | 19 / 10 | 12,223 |
| Buffered Responses, local redact | 200, `[REDACTED]` | 18 / 9 | 11,112 |
| Chat text stream, no output policy | 200, terminal `[DONE]` | 18 / 9 | 11,112 |

The total new charge is **34,447 nanounits**. All three native attempts are `confirmed_completed` with `provider_reported` usage and no open customer hold. Independent native verification calculates each charge from the pinned tariff and quantities and checks its exact negative customer ledger entry. Blocking delivery does not erase executed generation usage.

The captured request equals the actual submitted JSON. The user explicitly includes a fresh marker in the prompt, so that marker remains in the input capture. This is distinct from generated output: neither the delivered blocked/redacted response nor its response capture contains the withheld marker. The ordinary text stream returns its requested marker after assembling content deltas; terminal usage agrees with native quantities.

For all three requests, independently read native response capture equals the final delivered response bytes exactly. The capture is complete and untruncated, and reads after Gateway restart match. Guardrail diagnostics and request details contain safe projections without the fresh markers or procurement fields. Independently decrypted existing Provider credentials are absent from delivered responses, captures and diagnostics.

## Integration boundary

SDK and frontend consumers can read the existing workspace-scoped `GET /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads` contract. Its `data` contains `request`, `response`, `content_type`, `complete`, `truncated` and `expires_at`. `response` is the delivered body, including SSE text for streams; it is not a hidden upstream response. Consumers must inspect completion and truncation rather than treat an initial streaming HTTP 200 as final success.

Capture defaults to enabled; `x-niu-log-payloads: false` opts out. Capture is bounded to 1 MiB and retained for up to 24 hours under the existing deletion/expiry contract. These request/response payloads are stored as bounded plain JSON/text, not ciphertext. The independently verified Provider credential ciphertexts are a separate storage domain.

Independent source/final comparison preserves all original financial rows and the complete funding-receipt, Provider configuration and model fingerprints. Three existing credential ciphertexts decrypt under the preserved encryption identity. Both temporary verification keys are revoked, and copied Gateway/PostgreSQL processes are stopped. Original database and configuration remain unchanged.

No source defect was found in this bounded run. Streamed output enforcement, tool-output inspection, external-detector success and the remaining F09 acceptance paths are not established by this evidence. Their unsupported or unverified status must remain visible; these results do not close S04-3 or frontend UI acceptance.

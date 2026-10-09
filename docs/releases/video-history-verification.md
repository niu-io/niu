# Durable video history API checkpoint

Status: partial V02/V05/V14/V16/V17 evidence; complete customer Video workflow and live qualification remain open.

`GET /v1/video/jobs` lists saved dispatched jobs from the current workspace,
filtered by the API key's current model grants. Unknown submission outcomes stay
visible even without an upstream reference. History contains only the Niu job
binding, model, saved state and exact creation time. Prompts, upstream job IDs,
result URLs, credentials and Supplier prices are excluded. This read makes no
Provider call, creates no generation and performs no settlement.

Pagination is bounded to 1–100 entries (default 25), ordered by creation time and
a stable tie-breaker using the existing workspace activity index. An inaccessible
cursor is rejected rather than used to traverse another workspace or model.
Malformed and unknown query parameters return the standard JSON error shape.
The SDK exposes `client.video.jobs.list({ limit, before }, options)`, rejects
invalid client limits/cursors and preserves exact creation-time strings.

## Verification scope

Four gateway video tests and all 133 SDK tests passed. Storage/gateway Clippy
passed for all targets with warnings denied. Unique OpenAPI keys, all 99 local
references, changed-file whitespace and public-boundary checks passed.

Gateway fixtures traverse two saved pages without duplicates, covering uncertain,
queued, running and conflicting terminal states; verify empty foreign-workspace
and model-denied results; and reject foreign/unknown/malformed cursors, unknown
parameters, out-of-range limits and revoked credentials. SDK tests verify exact
values beyond JavaScript's safe integer range and bounded GET pagination.

## Remaining

Connect model/input controls, estimate confirmation, submission, history/details,
measured timings and authorized results in the customer Video workflow. Complete
media safety, retention and live/packaged acceptance separately. Do not display
raw job identifiers in product screens or treat a saved succeeded state as proof
of an available result or a settled charge.

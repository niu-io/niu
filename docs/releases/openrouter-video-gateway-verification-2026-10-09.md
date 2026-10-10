# OpenRouter video gateway checkpoint — 2026-10-09

## Implemented backend path

Personal `openrouter-video-v1` routes now use the existing Niu video APIs for
model discovery, estimates, submission, durable job identity, explicit refresh,
automatic query recovery and authenticated result retrieval. The request adapter
translates validated text and supported controls. It never retries submission.
Commercial/customer-funded admission remains unavailable for this channel until
the upstream billable quantity and customer pricing contract are qualified.

Seconds estimates no longer require an unsupported frame-rate control. Saved
effective output represents absent frame rate as `null`; pixel-based estimation
still requires it. Existing snapshots with a numeric frame rate retain their
serialized value and interpretation. OpenAPI and JavaScript SDK types reflect
the nullable field.

## Current-input end-to-end evidence

The running gateway used the existing PostgreSQL database, encryption identity
and personal OpenRouter credential. A private model mapping selected the actual
`x-ai/grok-imagine-video-1.5-lite` model for text input, one second, 480p and 16:9.
The model appeared in the authorized video catalog. The estimate returned one
second with explicitly estimated provenance, no customer price and null FPS.

Niu submitted one actual upstream generation and returned HTTP 202 with its own
durable job reference. The gateway was restarted with `NIU_VIDEO_POLLING=true`.
Reading persisted state observed the existing job transition from unknown to
succeeded through the automatic recovery worker; no manual resubmission was
made.

The Niu result endpoint downloaded an 85,723-byte MP4. Independent `ffprobe`
inspection found H.264 at 848×480, approximately 1.04 seconds, with audio and a
thumbnail stream. Full `ffmpeg` decoding completed. A second gateway restart
preserved identical status, billing and result-availability responses; downloading
again produced the same SHA-256 digest.

An independent PostgreSQL query confirmed one dispatched attempt, one bound
upstream job, one saved output snapshot and one encrypted result reference. Query
evidence recorded success with missing reported quantity. No customer balance
reservation or ledger entry existed for this attempt. Billing remained
owner-funded with null customer charge and null reported usage; the requested
duration was not relabeled as actual usage.

A key in another workspace of the same account, granted the same model, received
HTTP 404 for job status, billing, result availability and result download. After
the qualification key was revoked, its result request returned HTTP 401. Private
job references, credentials, result URLs and artifacts remain outside Git.

## Remaining scope and frontend integration

This evidence covers the exercised personal text-generation path only. It does
not qualify customer charging, additional models, references, callback contracts,
upstream failures, credential changes during generation or a complete release.
Fixture-test outcomes are not used as evidence.

Frontend work remains assigned to the frontend machine. Its schema editor must
allow seconds estimation without FPS, and estimate/billing views must omit the
FPS label for null values. No frontend file was changed or browser workflow
qualified in this backend increment.

## Handler-generated read contracts (2026-10-10)

The public history, persisted status and customer billing reads now publish their
OpenAPI operations from Rust handler comments. The root contract references those
operations and the shared video billing schemas; the generated documentation and
downloadable JSON contain the same definitions.

A current-input read used a saved, actually generated personal video and a new
short-lived model-scoped workspace key. History contained the saved job, status
remained `succeeded`, and billing remained `owner_funded` with a null customer
charge. Actual response types, required fields, closed object fields and enums
matched the generated schemas. Revoking the temporary key denied the subsequent
status read with HTTP 401. Independent database counts of transport observations,
customer balance entries and Supplier earnings were unchanged across the reads.
No upstream query or generation was requested. This verifies these persisted
personal-job reads, not customer-priced video settlement or current result
availability.

## Session billing contract follow-up

The Dashboard-session billing operation now comes from its handler annotation
and shares the generated `VideoJobBilling` schema with the inference-key API.
A current read of the saved actual video job returned identical owner-funded
billing through both paths, with null customer charge. A foreign workspace viewer
received HTTP 403; revoking the selected key made the session billing read return
HTTP 401. Submission timing, customer balance-entry and Supplier earnings counts
were unchanged. Temporary verification sessions were revoked. The docs site's
served generated specification matched the repository artifact. This verifies
saved personal-job reads and authorization, not customer-priced video settlement.

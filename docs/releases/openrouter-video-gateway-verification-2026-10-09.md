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

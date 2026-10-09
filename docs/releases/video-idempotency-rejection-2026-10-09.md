# Explicit rejection of unsupported video idempotency

Date: 2026-10-09. Video creation does not implement idempotent submission.
Previously, both creation handlers ignored `Idempotency-Key`, allowing a client
to submit generation while mistakenly expecting that key to deduplicate retries.
Both handlers now reject the header with HTTP 501 after authorization and before
job preparation. The error does not echo its value. An empty header is rejected
as well. The API contract and video reference document this behavior.

## Current-input verification

Using the running gateway, its PostgreSQL database and the configured personal
OpenRouter video model:

- A new, temporary scoped key obtained HTTP 200 from the real video estimate
  endpoint for the submitted model and text.
- The inference-key creation endpoint returned HTTP 501 for the same valid body
  with a nonempty idempotency header and with an empty header.
- The authenticated dashboard-key creation endpoint returned the same explicit
  unsupported-operation response for both cases.
- None of these responses contained an attempt identifier. An independent
  PostgreSQL query found no attempts for the dedicated key; no generation was
  dispatched by this verification. The key was then revoked.

This is an admission safety correction, not implementation or qualification of
idempotent video creation. Do not repeat an uncertain creation without such a
guarantee. Recover an existing saved job through its reference. Full client
submission deduplication remains open. No frontend behavior was changed or
qualified, and no fixture-test outcome is used as evidence.

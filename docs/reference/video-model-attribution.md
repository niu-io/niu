# Video Provider model attribution

Request detail and activity retain the existing nullable `provider_model` field.
It represents a model explicitly returned by the Provider, not the configured
public alias or a guessed upstream mapping.

Video query decoders now preserve the response model after matching the job and
model against the immutable recovery route. OpenRouter may omit the model; in
that case the decoder supplies no attribution. The configured expected model is
still used for route/identity validation, but never fills `provider_model`.
Ark query decoding continues to require an explicit matching model.

When a query supplies a model, storage writes it with the content-free query
receipt in one transaction. It only updates a dispatched attempt in the matching
workspace and cannot overwrite a different non-null identity. No credentials,
upstream job IDs, result URLs or raw payloads are added to customer diagnostics.
The existing receipt format remains unchanged. Amounts, usage and completion
state keep their separate evidence requirements.

Existing videos can gain attribution through a new authorized query that
actually reports the model. Merely reading Logs does not contact the upstream,
backfill a configured value or submit another generation. Restart preserves the
saved attribution. Frontend consumers can continue using `provider_model` without
a new endpoint or SDK response shape.

This fixes model attribution only. Saved intent content is not a retained upstream
request/response body; video payload retention remains separate work with its
own authorization, expiry, deletion and redaction requirements.

## Current-input verification — 2026-10-10

A native Gateway reopened a retained, completed personal OpenRouter video job
and performed an authorized upstream refresh. A separate read of the same
upstream job omitted `model`; both the scoped request-detail API and PostgreSQL
therefore retained a null `provider_model`. After restarting the Gateway, the
same diagnostic and job remained available. Independent verification reopened
the stopped database and compared the retained raw response with the request
record: one original completed attempt, no new generation and no customer
charge or balance entry.

This verifies the honest missing-model path and its persistence. It does not
qualify positive model attribution for a Provider response containing `model`,
Ark execution, raw video transport payload retention, or commercial settlement.

# Ingested image video input

The Gateway implements a short-lived ordinary-image reference input for configured
`ark-direct-v1` video routes. This is an integration implementation, not a claim
that the complete Seedance asset workflow has passed actual acceptance. S08-2
remains active. Durable library rights, portrait identity workflows, video/audio
references and callback delivery remain unfinished or unsupported.

## Request contract

Use `POST /v1/video/jobs` with ordinary text and an `ingested_image` block. The
JavaScript SDK exports `IngestedVideoImageInput` within `VideoCreateRequest`:

```typescript
const request = {
  model: selectedModel,
  content: [
    { type: 'text' as const, text: prompt },
    {
      type: 'ingested_image' as const,
      ingested_image: {
        ingestion_id: ingestionId,
        readiness_id: readinessId,
        consent_to_reuse: true as const,
      },
      // Include role only when declared by the selected model's image rule.
    },
  ],
};
```

The IDs must come from the saved ingestion and its latest readiness observation.
They are routing references, not display names. Missing/false consent, malformed
IDs and extra fields are refused. Client-supplied Provider `asset://` URIs are
never accepted. Mixing inline images and ingested references is currently
unsupported. Image submission with an idempotency key remains unsupported; do
not interpret that restriction as permission to retry an uncertain generation.

## Authorization and task lifetime

The resolver requires the current workspace/key and model policy, the exact
original Supplier credential/model revisions, a retained ordinary-image group,
current original creation/read grants, a latest original-account Active
observation, retained inspected source bytes and current inspection proofs.
An Active observation alone grants no generation permission.

The private Provider URI is used only for the selected transport. Logs retain
Niu input IDs rather than substituting the private URI. Immediately before
submission, one bounded transaction revalidates bindings, saves immutable request
hash/reference metadata and marks dispatch. A dispatch trigger rechecks the
shared deadline because time can advance while locks are held. No network call
occurs under these locks.

The deadline is the earliest applicable original consent, source, group request,
grant and key expiry. Existing ingestion consent lasts at most 900 seconds; this
implementation does not convert it into a permanent asset-library grant. Erased,
expired, revoked or changed bindings fail closed. Generic readiness metadata does
not establish model-specific reuse authorization; dispatch performs that check.

After dispatch the existing asynchronous job/query/result/restart mechanisms
apply. An uncertain submission is retained and never automatically resubmitted.
This input does not qualify paid media settlement or change unknown usage into a
billable quantity.

## Verification status

The integrated media/storage/Gateway path compiled and linted from staged or
committed source. Migration 0284 was applied and rolled back on an isolated native
schema-283 copy, including explicit trigger-query column/type checks. The SDK
compiles with the new input type. These establish static compatibility only.
Current-input HTTP refusals and a real positive asset-to-video generation remain
separate acceptance work. No saved Active response, consent, qualification or
upstream result was fabricated; fixture outcomes provide no evidence.

---
title: "Claim and dispatch one inspected image ingestion"
description: "POST /v1/media/image-ingestions/{id}/dispatch"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/image-ingestions/{id}/dispatch`

Requires original source API key, current policy, detector terms and reviewed CreateAsset permission. A trusted configured HTTPS origin serves the exact inspected bytes using an expiring capability. Four uploads may run concurrently. The bounded worker survives client disconnect; its immutable accepted or uncertain outcome is persisted. Never automatically replay an uncertain upload. Acceptance does not mean asset readiness. No client-supplied source URL, destination override or credential is accepted.

Operation: `dispatchImageIngestion`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/image-ingestions/{id}/dispatch" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/image-ingestions/{id}/dispatch" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### id

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

### application/json

Optional.

Omit the body or send an empty JSON object. Unknown fields and other JSON values are rejected before any upstream claim.

```json
{
  "type": "object",
  "additionalProperties": false,
  "maxProperties": 0
}
```

## Responses

### HTTP 200

Persisted customer-safe accepted or uncertain ingestion status

### HTTP 400

Expected an empty command object

### HTTP 401

Active original API key required

### HTTP 403

Current policy required

### HTTP 409

Consent unavailable, already claimed or no longer authorized

### HTTP 503

Source origin or encryption unavailable, upload capacity exhausted or worker storage unavailable

## Behavior and supported scope

Requires original source API key, current policy, detector terms and reviewed CreateAsset permission. A trusted configured HTTPS origin serves the exact inspected bytes using an expiring capability. Four uploads may run concurrently. The bounded worker survives client disconnect; its immutable accepted or uncertain outcome is persisted. Never automatically replay an uncertain upload. Acceptance does not mean asset readiness. No client-supplied source URL, destination override or credential is accepted.

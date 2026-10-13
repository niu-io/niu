---
title: "Observe accepted image status using its original account"
description: "POST /v1/media/image-ingestions/{id}/readiness/{read_id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/media/image-ingestions/{id}/readiness/{read_id}`

Separate current GetAsset permission and the original API key are required. One outstanding observation per ingestion, sixty per rolling hour and four concurrent gateway reads. One fixed bounded GetAsset request validates asset identity, group, project and image type before persisting status. The worker survives disconnect; interrupted reads record failure. This does not repeat creation, download media or grant reusable-reference rights. A claimed read_id is never replayed; use GET to inspect its saved outcome.

Operation: `refreshIngestedImageReadiness`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/media/image-ingestions/{id}/readiness/{read_id}" \
  -H "Authorization: Bearer $NIU_API_KEY" \
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

### read_id

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

Persisted observation; status pending/succeeded/failed, asset_status Active/Processing/Failed or null, safe reason, duration_ms, observed_at and reuse_available false. A successful Processing observation does not imply an active asset.

### HTTP 400

Expected an empty command object

### HTTP 401

Active original API key required

### HTTP 403

Current workspace authorization required

### HTTP 409

Accepted ingestion or reviewed permission unavailable, claimed read identity, pending observation or polling limit

### HTTP 503

Read capacity, credentials or persistence unavailable

## Behavior and supported scope

Separate current GetAsset permission and the original API key are required. One outstanding observation per ingestion, sixty per rolling hour and four concurrent gateway reads. One fixed bounded GetAsset request validates asset identity, group, project and image type before persisting status. The worker survives disconnect; interrupted reads record failure. This does not repeat creation, download media or grant reusable-reference rights. A claimed read_id is never replayed; use GET to inspect its saved outcome.

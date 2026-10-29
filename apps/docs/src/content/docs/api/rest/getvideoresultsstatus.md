---
title: "Read saved result availability without downloading media"
description: "GET /v1/video/jobs/{id}/results"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs/{id}/results`

Requires current scoped model and compatible policy access. Returns no URLs or media content. Missing means no captured reference; unavailable includes expiry, deletion or conflicting terminal evidence. No regeneration, download or automatic query is performed.

Operation: `getVideoResultsStatus`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/results" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/results" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
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

No request body is declared.

## Responses

### HTTP 200

Current saved availability

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "video",
    "last_frame"
  ],
  "properties": {
    "video": {
      "type": "string",
      "enum": [
        "available",
        "missing",
        "unavailable"
      ]
    },
    "last_frame": {
      "type": "string",
      "enum": [
        "available",
        "missing",
        "unavailable"
      ]
    }
  }
}
```

### HTTP 401

Invalid credential

### HTTP 403

Workspace or policy access denied

### HTTP 404

Missing or inaccessible job

## Behavior and supported scope

Requires current scoped model and compatible policy access. Returns no URLs or media content. Missing means no captured reference; unavailable includes expiry, deletion or conflicting terminal evidence. No regeneration, download or automatic query is performed.

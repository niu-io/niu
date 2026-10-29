---
title: "Read persisted video job state"
description: "GET /v1/video/jobs/{id}"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs/{id}`

Requires a current workspace API key with access to the original model. Reads saved evidence only; performs no upstream poll, generation or settlement. Succeeded does not guarantee available results, reported usage or a settled charge. No upstream identifiers, credentials or procurement values are returned.

Operation: `retrieveVideoJobState`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}" \
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

Durable scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "object",
    "model",
    "status"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "object": {
      "const": "video.job"
    },
    "model": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "submission_unknown",
        "queued",
        "running",
        "succeeded",
        "failed",
        "unknown",
        "reconciliation_required"
      ]
    }
  }
}
```

### HTTP 401

Invalid, expired or revoked credential

### HTTP 404

Missing job, workspace mismatch or model access denied

## Behavior and supported scope

Requires a current workspace API key with access to the original model. Reads saved evidence only; performs no upstream poll, generation or settlement. Succeeded does not guarantee available results, reported usage or a settled charge. No upstream identifiers, credentials or procurement values are returned.

**Supported scope:** implemented

**Supported scope:** Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence.

---
title: "List durable workspace video jobs"
description: "GET /v1/video/jobs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs`

Reads saved dispatched jobs, including uncertain submissions, in newest-first creation order with an ID tie-breaker. Applies current key workspace/model grants and returns no upstream references, prompts, credentials or procurement terms. Listing does not poll or regenerate videos. Cursor jobs must remain accessible under the current key. New head entries do not move existing cursor positions.

Operation: `listVideoJobHistory`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs" \
  -H "Authorization: Bearer $NIU_API_KEY"
```

## Parameters

### before

Location: **query**. Optional. next_before from the preceding page; scoped to currently accessible jobs.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 25
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved scoped job history

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data",
    "has_more",
    "next_before"
  ],
  "properties": {
    "has_more": {
      "type": "boolean"
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "object",
          "model",
          "status",
          "created_at_ms"
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
          "created_at_ms": {
            "type": "string",
            "pattern": "^-?[0-9]+$",
            "description": "Exact Unix milliseconds from the saved attempt."
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
    }
  }
}
```

### HTTP 400

Invalid limit, unknown query field, malformed or inaccessible cursor

### HTTP 401

Invalid, expired or revoked credential

## Behavior and supported scope

Reads saved dispatched jobs, including uncertain submissions, in newest-first creation order with an ID tie-breaker. Applies current key workspace/model grants and returns no upstream references, prompts, credentials or procurement terms. Listing does not poll or regenerate videos. Cursor jobs must remain accessible under the current key. New head entries do not move existing cursor positions.

**Supported scope:** implemented

**Supported scope:** Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence.

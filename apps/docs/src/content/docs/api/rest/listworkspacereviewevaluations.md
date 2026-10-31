---
title: "Review: List workspace evaluation definitions"
description: "GET /api/v1/workspaces/{workspace}/evaluations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/workspaces/{workspace}/evaluations`

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

Operation: `listWorkspaceReviewEvaluations`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/workspaces/{workspace}/evaluations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### workspace

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
  "maxLength": 80
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Scoped evidence

Content type: `application/json`.

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 100,
      "items": {
        "type": "object",
        "properties": {
          "slug": {
            "type": "string",
            "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
            "maxLength": 80
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "task": {
            "type": "string",
            "minLength": 1,
            "maxLength": 4000
          },
          "rubric": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8000
          },
          "protocol": {
            "type": "string",
            "enum": [
              "chat",
              "responses",
              "messages",
              "embeddings",
              "generate_content"
            ]
          },
          "revision": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740990
          },
          "samples": {
            "type": "array",
            "minItems": 1,
            "maxItems": 64,
            "items": {
              "type": "object",
              "properties": {
                "reference": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 100,
                  "pattern": "^[A-Za-z0-9_.-]+$"
                },
                "request_sha256": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                }
              },
              "required": [
                "reference",
                "request_sha256"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "slug",
          "name",
          "task",
          "rubric",
          "protocol",
          "revision",
          "samples"
        ],
        "additionalProperties": false
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "data",
    "next_after"
  ]
}
```

### HTTP 400

Invalid input or mismatched evaluation binding

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Current delegated capability required

### HTTP 404

Scoped definition or run not found

### HTTP 409

Revision or immutable submission conflict

## Behavior and supported scope

Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.

**Supported scope:** implemented

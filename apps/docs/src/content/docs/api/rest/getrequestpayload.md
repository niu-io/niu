---
title: "Read retained request content in an authorized workspace"
description: "GET /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads`

Content is separate from accounting, expires 24 hours after the original request creation time and is retained by default unless the inference request opts out. Missing or expired content returns null. Headers and known confidential Provider cost fields are excluded, including historical response usage metadata sanitized on read. Truncated SSE captures expose only complete sanitized events. Truncated JSON that cannot be safely parsed is withheld as an empty response string with response_omitted true, while authorized request content stays readable. Other malformed or incomplete structured responses fail closed with 503. Known credential fields in historical request objects are removed on read. Arbitrary secrets embedded in prompts are not automatically redacted.

Operation: `getRequestPayload`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### attempt

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

Workspace read permission required. Response uses Cache-Control no-store.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "request",
            "response",
            "content_type",
            "complete",
            "truncated",
            "expires_at"
          ],
          "properties": {
            "request": {
              "description": "Captured JSON request with known credential fields removed."
            },
            "response": {
              "type": "string",
              "description": "Sanitized retained output; empty when response_omitted is true."
            },
            "response_omitted": {
              "type": "boolean",
              "description": "True when truncated JSON cannot be safely parsed and its response body is withheld. Request content remains available."
            },
            "content_type": {
              "type": "string"
            },
            "complete": {
              "type": "boolean"
            },
            "truncated": {
              "type": "boolean"
            },
            "expires_at": {
              "type": "string",
              "description": "PostgreSQL timestamp identifying content expiry."
            }
          }
        }
      ]
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

The authenticated role lacks the required permission.

### HTTP 404

Workspace is outside the authenticated scope.

### HTTP 503

Retained structured response cannot be safely serialized, or content storage is unavailable. No unsanitized payload is returned.

## Behavior and supported scope

Content is separate from accounting, expires 24 hours after the original request creation time and is retained by default unless the inference request opts out. Missing or expired content returns null. Headers and known confidential Provider cost fields are excluded, including historical response usage metadata sanitized on read. Truncated SSE captures expose only complete sanitized events. Truncated JSON that cannot be safely parsed is withheld as an empty response string with response_omitted true, while authorized request content stays readable. Other malformed or incomplete structured responses fail closed with 503. Known credential fields in historical request objects are removed on read. Arbitrary secrets embedded in prompts are not automatically redacted.

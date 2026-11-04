---
title: "Resolve a platform incident to its connection"
description: "GET /api/v1/incidents/{incident}/connection"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/incidents/{incident}/connection`

Platform administration required. Resolves a durable incident reference to its connection identifier for authorized management navigation. Returns no credential, upstream URL, request content or financial information. A missing incident returns 404. This read does not change configuration or call the Provider. Cache-Control no-store.

Operation: `resolveIncidentConnection`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/incidents/{incident}/connection" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### incident

Location: **path**. **Required.**

```json
{
  "type": "string",
  "pattern": "^incident-[1-9][0-9]*$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Internal connection routing identifier

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "connection_id"
      ],
      "properties": {
        "connection_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid incident reference

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Incident unavailable

### HTTP 503

Evidence unavailable

## Behavior and supported scope

Platform administration required. Resolves a durable incident reference to its connection identifier for authorized management navigation. Returns no credential, upstream URL, request content or financial information. A missing incident returns 404. This read does not change configuration or call the Provider. Cache-Control no-store.

**Supported scope:** implemented

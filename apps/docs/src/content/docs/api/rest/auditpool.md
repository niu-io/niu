---
title: "Audit routing and billing strategy for a model route pool"
description: "GET /api/v1/pools/{reference}/audit"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/pools/{reference}/audit`

Returns pricing readiness, margin safety, configured weight shares vs. observed traffic shares, completion rate, latency, customer revenue, upstream cost, and strategy findings for a model route pool.

Operation: `auditPool`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/pools/{reference}/audit" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### reference

Location: **path**. **Required.** Unpadded base64url encoding of the exact ASCII pool alias.

```json
{
  "type": "string",
  "minLength": 2,
  "maxLength": 267,
  "pattern": "^[A-Za-z0-9_-]+$"
}
```

### days

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 365,
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Pool routing and billing audit report

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object"
    }
  }
}
```

### HTTP 400

Invalid reference or window days

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Pool not found

## Behavior and supported scope

Returns pricing readiness, margin safety, configured weight shares vs. observed traffic shares, completion rate, latency, customer revenue, upstream cost, and strategy findings for a model route pool.

**Supported scope:** implemented

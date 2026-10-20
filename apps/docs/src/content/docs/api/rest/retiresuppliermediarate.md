---
title: "End a Provider purchase schedule's eligibility"
description: "POST /api/v1/providers/{provider}/media-rates/{revision}/retire"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/media-rates/{revision}/retire`

Installation write permission only. Appends an immutable eligibility cutoff within the original interval; the cutoff is exclusive for original-card selection. Publish the replacement with a matching effective start before the cutoff. Exact replay is idempotent; changed cutoff or missing Provider/revision conflicts. Historical purchase snapshots, earnings and payments are unchanged. Incomplete or overlapping schedules fail closed. Retirement is not cancellation or a refund.

Operation: `retireSupplierMediaRate`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "operatorBearer": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/media-rates/{revision}/retire" \
  -H "Authorization: Bearer $NIU_MEMBER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### revision

Location: **path**. **Required.**

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 256
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "effective_until"
  ],
  "properties": {
    "effective_until": {
      "type": "integer",
      "format": "int64",
      "description": "Unix seconds"
    }
  }
}
```

## Responses

### HTTP 200

Cutoff saved or exact replay accepted

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "revision",
        "effective_until"
      ],
      "properties": {
        "revision": {
          "type": "string"
        },
        "effective_until": {
          "type": "string",
          "pattern": "^-?[0-9]+$"
        }
      }
    }
  }
}
```

### HTTP 400

Invalid cutoff or revision

### HTTP 401

Installation authentication required

### HTTP 403

Installation write permission required

### HTTP 409

Missing scoped revision or conflicting saved cutoff

### HTTP 413

Body exceeds 1 KiB

### HTTP 422

Malformed typed JSON

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation write permission only. Appends an immutable eligibility cutoff within the original interval; the cutoff is exclusive for original-card selection. Publish the replacement with a matching effective start before the cutoff. Exact replay is idempotent; changed cutoff or missing Provider/revision conflicts. Historical purchase snapshots, earnings and payments are unchanged. Incomplete or overlapping schedules fail closed. Retirement is not cancellation or a refund.

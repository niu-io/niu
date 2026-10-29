---
title: "End a published customer media rate's eligibility"
description: "POST /api/v1/organizations/{organization}/billing/media-rates/{revision}/retire"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/media-rates/{revision}/retire`

Platform-administrator write permission required. Installation credentials and explicitly granted member administrators are supported. Appends an immutable cutoff without modifying the original card or historical job snapshots. Cutoff is inclusive for retirement and must be within the original effective interval, including its start/end boundaries. Exact replay is idempotent; changed cutoff or unknown customer/revision conflicts. Publish the replacement with an effective start matching the cutoff. No rate or procurement fallback occurs if no eligible replacement exists; remaining overlaps are rejected as ambiguous.

Operation: `retireCustomerMediaRate`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/media-rates/{revision}/retire" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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
      "description": "Unix seconds"
    }
  }
}
```

## Responses

### HTTP 200

Retirement saved or identical replay accepted

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
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

Invalid revision or cutoff outside original interval

### HTTP 401

Administrator authentication required

### HTTP 403

Platform-administrator write permission required

### HTTP 409

Missing scoped revision or conflicting previous cutoff

### HTTP 413

Body exceeds 1 KiB

### HTTP 422

Malformed typed JSON body

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Platform-administrator write permission required. Installation credentials and explicitly granted member administrators are supported. Appends an immutable cutoff without modifying the original card or historical job snapshots. Cutoff is inclusive for retirement and must be within the original effective interval, including its start/end boundaries. Exact replay is idempotent; changed cutoff or unknown customer/revision conflicts. Publish the replacement with an effective start matching the cutoff. No rate or procurement fallback occurs if no eligible replacement exists; remaining overlaps are rejected as ambiguous.

**Supported scope:** implemented

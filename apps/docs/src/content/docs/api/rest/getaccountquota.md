---
title: "Read latest quota observations and freshness"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota`



Operation: `getAccountQuota`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota" \
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

### account

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

Latest quota sample for each provider window. Freshness and reset timestamps remain explicit; BIGINT quantities are decimal strings for JavaScript precision.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "window_key",
          "unit",
          "remaining",
          "maximum",
          "observed_at_ms",
          "valid_until_ms",
          "resets_at_ms",
          "source",
          "previous_remaining",
          "previous_observed_at_ms",
          "fresh"
        ],
        "properties": {
          "window_key": {
            "type": "string"
          },
          "unit": {
            "type": "string",
            "enum": [
              "tokens",
              "requests",
              "millionths_of_window"
            ]
          },
          "remaining": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "maximum": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "observed_at_ms": {
            "type": "integer"
          },
          "valid_until_ms": {
            "type": "integer"
          },
          "resets_at_ms": {
            "type": "integer"
          },
          "source": {
            "type": "string"
          },
          "previous_remaining": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[0-9]+$"
          },
          "previous_observed_at_ms": {
            "type": [
              "integer",
              "null"
            ]
          },
          "fresh": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid administrator token.

## Behavior and supported scope

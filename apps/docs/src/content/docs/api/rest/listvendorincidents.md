---
title: "Read upstream connection incidents and recovery evidence"
description: "GET /api/v1/vendors/{vendor}/incidents"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{vendor}/incidents`

Requires platform administration. Returns adapter-qualified refusals grouped by connection and model, with durable references, occurrence counts and evidence-based recovery times. Covers recognized account restrictions, qualified OpenRouter authentication refusals, and repeated 5xx or connection/timeout failures within five minutes. Unknown HTTP refusals do not establish an account restriction. Recovery requires a later confirmed complete successful request under the current enabled connection and model mapping revisions. This read performs no upstream request, retries, routing changes or financial mutations. No request content, raw upstream bodies, credentials, procurement prices or tenant identities are returned. Pages contain at most 50 records, newest incident first. Follow next_before; a null cursor ends the current view.

Operation: `listVendorIncidents`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{vendor}/incidents" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### vendor

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### before

Location: **query**. Optional. Durable incident reference from next_before.

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

Sanitized operational incidents

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_before"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "required": [
          "reference",
          "model",
          "cause",
          "status",
          "first_observed_at",
          "last_observed_at",
          "observations",
          "recovered_at"
        ],
        "properties": {
          "reference": {
            "type": "string"
          },
          "model": {
            "type": "string"
          },
          "cause": {
            "type": "string",
            "enum": [
              "account_restricted",
              "authentication_rejected",
              "repeated_upstream_failures"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "active",
              "resolved"
            ]
          },
          "first_observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "last_observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "observations": {
            "type": "string",
            "pattern": "^[1-9][0-9]*$"
          },
          "recovered_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          }
        }
      }
    },
    "next_before": {
      "type": [
        "string",
        "null"
      ]
    }
  }
}
```

### HTTP 400

Invalid cursor

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Connection unavailable

### HTTP 503

Operational evidence unavailable

## Behavior and supported scope

Requires platform administration. Returns adapter-qualified refusals grouped by connection and model, with durable references, occurrence counts and evidence-based recovery times. Covers recognized account restrictions, qualified OpenRouter authentication refusals, and repeated 5xx or connection/timeout failures within five minutes. Unknown HTTP refusals do not establish an account restriction. Recovery requires a later confirmed complete successful request under the current enabled connection and model mapping revisions. This read performs no upstream request, retries, routing changes or financial mutations. No request content, raw upstream bodies, credentials, procurement prices or tenant identities are returned. Pages contain at most 50 records, newest incident first. Follow next_before; a null cursor ends the current view.

**Supported scope:** implemented

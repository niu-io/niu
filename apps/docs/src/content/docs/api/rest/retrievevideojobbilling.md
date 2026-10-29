---
title: "Read saved customer video billing"
description: "GET /v1/video/jobs/{id}/billing"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs/{id}/billing`

Current workspace/model authorization applies. This read performs no upstream query or settlement. Exact amounts are decimal strings in billionths of the declared currency. Only a posted customer debit is a charge; unresolved liability remains explicit. Personal owner-funded jobs have no Niu customer price or charge. Procurement terms and internal revision identifiers are excluded.

Operation: `retrieveVideoJobBilling`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/billing" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/billing" \
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

Saved customer accounting snapshot

Content type: `application/json`.

```json
{
  "type": [
    "object",
    "null"
  ],
  "additionalProperties": false,
  "description": "Saved estimated quantity priced using the original customer tariff. Neither confirmed usage, maximum liability nor a final charge. Owner-funded or unpriceable amounts remain null.",
  "required": [
    "meter",
    "quantity",
    "provenance",
    "currency",
    "amount_nanos"
  ],
  "properties": {
    "meter": {
      "type": "string"
    },
    "quantity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "numerator",
        "denominator"
      ],
      "properties": {
        "numerator": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "denominator": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        }
      }
    },
    "provenance": {
      "type": "string",
      "enum": [
        "Estimate"
      ]
    },
    "currency": {
      "type": [
        "string",
        "null"
      ]
    },
    "amount_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "unit_code": {
      "type": [
        "string",
        "null"
      ]
    },
    "amount_atoms": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    }
  }
}
```

### HTTP 401

Invalid credential

### HTTP 404

Missing job or workspace/model access denied

## Behavior and supported scope

Current workspace/model authorization applies. This read performs no upstream query or settlement. Exact amounts are decimal strings in billionths of the declared currency. Only a posted customer debit is a charge; unresolved liability remains explicit. Personal owner-funded jobs have no Niu customer price or charge. Procurement terms and internal revision identifiers are excluded.

**Supported scope:** implemented

**Supported scope:** Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence.

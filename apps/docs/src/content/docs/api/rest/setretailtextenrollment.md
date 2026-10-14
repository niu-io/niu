---
title: "Enroll a workspace model in a platform selling price"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment`

Explicit platform administration required. price_id chooses a published text identity with the same model and an existing company/currency balance account; no account, credit, funds, Supplier qualification or selling permission is created. Explicit null restores legacy workspace tariff selection for future operations. expected_version zero creates the configuration; updates use immutable version history and an exact company/workspace-scoped idempotency key. Existing operation prices, charges and legacy current tariff pointers are unchanged. Missing price_id is rejected rather than silently disabling enrollment. No automatic retry.

Operation: `setRetailTextEnrollment`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "required": [
    "model_alias",
    "price_id",
    "expected_version",
    "idempotency_key",
    "reason"
  ],
  "properties": {
    "model_alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "price_id": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    },
    "expected_version": {
      "type": "string",
      "pattern": "^[0-9]+$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    }
  },
  "additionalProperties": false
}
```

## Responses

### HTTP 200

Current configuration or exact committed outcome

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
        "revision",
        "version",
        "model_alias",
        "price_id"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "model_alias": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "price_id": {
          "type": [
            "string",
            "null"
          ],
          "format": "uuid"
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### HTTP 400

Invalid model, reason or exact version

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required

### HTTP 409

Stale version, conflicting key, unknown workspace, missing balance account or incompatible price identity

### HTTP 422

Malformed body or missing explicit price_id

## Behavior and supported scope

Explicit platform administration required. price_id chooses a published text identity with the same model and an existing company/currency balance account; no account, credit, funds, Supplier qualification or selling permission is created. Explicit null restores legacy workspace tariff selection for future operations. expected_version zero creates the configuration; updates use immutable version history and an exact company/workspace-scoped idempotency key. Existing operation prices, charges and legacy current tariff pointers are unchanged. Missing price_id is rejected rather than silently disabling enrollment. No automatic retry.

**Supported scope:** implemented

---
title: "Atomically set or reset customer-specific model prices"
description: "PUT /api/v1/admin/customers/{customer}/pricing"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`PUT /api/v1/admin/customers/{customer}/pricing`

Explicit platform administration required. Atomically retires prior active/scheduled customer-specific rules on each targeted standard price and publishes the explicit replacement selling schedule (never exceeding platform standard price). Passing schedule as null resets the model to platform standard pricing.

Operation: `setPlatformCustomerPricing`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/admin/customers/{customer}/pricing" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### customer

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

Updated customer pricing summary

### HTTP 400

Invalid selling schedule

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Customer or standard price not found

## Behavior and supported scope

Explicit platform administration required. Atomically retires prior active/scheduled customer-specific rules on each targeted standard price and publishes the explicit replacement selling schedule (never exceeding platform standard price). Passing schedule as null resets the model to platform standard pricing.

**Supported scope:** implemented

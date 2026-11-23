---
title: "Reset one model's customer-specific price back to platform standard pricing"
description: "DELETE /api/v1/admin/customers/{customer}/pricing/{price}"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`DELETE /api/v1/admin/customers/{customer}/pricing/{price}`

Explicit platform administration required. Retires active or scheduled customer-specific selling schedules for the specified customer and standard price, returning future requests to platform standard pricing without altering historical request charges.

Operation: `resetPlatformCustomerModelPricing`.

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
curl --fail-with-body -X DELETE "$NIU_ORIGIN/api/v1/admin/customers/{customer}/pricing/{price}" \
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

### price

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

Customer model pricing reset

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Customer or standard price not found

## Behavior and supported scope

Explicit platform administration required. Retires active or scheduled customer-specific selling schedules for the specified customer and standard price, returning future requests to platform standard pricing without altering historical request charges.

**Supported scope:** implemented

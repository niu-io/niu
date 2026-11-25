---
title: "List platform standard prices paired with one customer's active customer-specific prices"
description: "GET /api/v1/admin/customers/{customer}/pricing"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`GET /api/v1/admin/customers/{customer}/pricing`

Explicit platform administration required. Returns every published platform standard price along with this customer's active or scheduled customer-specific selling schedule in one bounded read snapshot. Never exposes supplier procurement prices or other customers' schedules.

Operation: `listPlatformCustomerPricing`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/admin/customers/{customer}/pricing" \
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

Customer pricing overview

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

Customer not found

## Behavior and supported scope

Explicit platform administration required. Returns every published platform standard price along with this customer's active or scheduled customer-specific selling schedule in one bounded read snapshot. Never exposes supplier procurement prices or other customers' schedules.

**Supported scope:** implemented

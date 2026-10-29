---
title: "Read payment or scoped funding readiness"
description: "GET /api/v1/payments/readiness"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/payments/readiness`

Anonymous reads describe installation payment configuration only. Authenticated reads may select an authorized company using organization; member sessions default to their own company. An explicit funded, granted or approved-credit arrangement in the platform currency permits that company to use self-hosted workspace features without a merchant. Empty accounts and another company’s funds never qualify. This setup decision is separate from per-request balance reservation; spending credits does not hide history or settings. Authentication, administration, directory lookup and funding recovery stay available. No amounts, merchant credentials or identities are returned.

Operation: `getPaymentReadiness`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {},
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: No credential.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/payments/readiness"
```

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/payments/readiness" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### organization

Location: **query**. Optional. Authenticated company scope; installation credentials may select a company, members may only select their own.

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

Current prerequisite state

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
        "ready",
        "reason"
      ],
      "properties": {
        "ready": {
          "type": "boolean"
        },
        "reason": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "currency_required",
            "payment_setup_required",
            null
          ]
        }
      }
    }
  }
}
```

### HTTP 401

Requested authenticated scope has no valid session

### HTTP 403

Company outside authorized scope

### HTTP 500

Readiness could not be established; clients must not assume readiness.

## Behavior and supported scope

Anonymous reads describe installation payment configuration only. Authenticated reads may select an authorized company using organization; member sessions default to their own company. An explicit funded, granted or approved-credit arrangement in the platform currency permits that company to use self-hosted workspace features without a merchant. Empty accounts and another company’s funds never qualify. This setup decision is separate from per-request balance reservation; spending credits does not hide history or settings. Authentication, administration, directory lookup and funding recovery stay available. No amounts, merchant credentials or identities are returned.

**Supported scope:** implemented

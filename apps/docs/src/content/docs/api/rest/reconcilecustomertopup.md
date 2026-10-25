---
title: "Independently reconcile a saved payment"
description: "POST /api/v1/organizations/{organization}/billing/topups/{order}/reconcile"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/billing/topups/{order}/reconcile`

Installation administrator or organization-wide billing owner/admin. Queries the original configured merchant under bounded query admission. Exact verified paid evidence funds atomically once; verified closed evidence records closure without funding. Never creates a checkout or automatically retries. Already paid or closed orders return their durable status without requiring merchant configuration or an upstream query. A successful response reports durable status, not necessarily paid. EPay query recovery is unsupported (501); signed notifications remain available. Merchant activation and received-cash funding require separate deployment evidence.

Operation: `reconcileCustomerTopup`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/topups/{order}/reconcile" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

### order

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

Saved top-up status; checkout and pending status confer no spending capacity

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
      "additionalProperties": false,
      "required": [
        "id",
        "currency",
        "amount_nanos",
        "payment_method",
        "status",
        "checkout_url"
      ],
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "description": "Internal API routing reference; never display as a product label."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Immutable saved account currency; no implicit conversion."
        },
        "amount_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "payment_method": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "reconciliation_required",
            "pending",
            "paid",
            "closed"
          ]
        },
        "checkout_url": {
          "type": [
            "string",
            "null"
          ],
          "format": "uri",
          "description": "Validated HTTPS checkout for pending orders only; null for paid and closed orders."
        }
      }
    }
  }
}
```

### HTTP 400

Invalid route identifier

### HTTP 401

Authentication required

### HTTP 403

Organization-wide billing write access required

### HTTP 404

Saved order missing

### HTTP 409

Conflicting immutable identity or terminal evidence

### HTTP 501

Saved adapter does not support query recovery

### HTTP 502

Integration unavailable, unresolved payment evidence or query admission busy/rate limited

### HTTP 503

Durable storage unavailable

## Behavior and supported scope

Installation administrator or organization-wide billing owner/admin. Queries the original configured merchant under bounded query admission. Exact verified paid evidence funds atomically once; verified closed evidence records closure without funding. Never creates a checkout or automatically retries. Already paid or closed orders return their durable status without requiring merchant configuration or an upstream query. A successful response reports durable status, not necessarily paid. EPay query recovery is unsupported (501); signed notifications remain available. Merchant activation and received-cash funding require separate deployment evidence.

**Supported scope:** implemented

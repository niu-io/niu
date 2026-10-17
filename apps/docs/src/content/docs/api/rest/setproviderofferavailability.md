---
title: "A Provider manager can pause or resume an owned offer"
description: "PATCH /api/v1/providers/{provider}/offers/{offer}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PATCH /api/v1/providers/{provider}/offers/{offer}`

Pausing prevents new admissions. Already dispatched requests may complete and accrue earnings. Viewers and unrelated operators cannot mutate offers.

Operation: `setProviderOfferAvailability`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X PATCH "$NIU_ORIGIN/api/v1/providers/{provider}/offers/{offer}" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### provider

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### offer

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
  "additionalProperties": false,
  "required": [
    "active"
  ],
  "properties": {
    "active": {
      "type": "boolean"
    }
  }
}
```

## Responses

### HTTP 200

Availability saved and audited

### HTTP 404

No eligible Provider membership

### HTTP 409

Offer unavailable in Provider scope

## Behavior and supported scope

Pausing prevents new admissions. Already dispatched requests may complete and accrue earnings. Viewers and unrelated operators cannot mutate offers.

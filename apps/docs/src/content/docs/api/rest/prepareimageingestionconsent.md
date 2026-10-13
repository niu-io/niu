---
title: "Consent to ingestion of one inspected image into one ordinary asset group"
description: "PUT /v1/media/image-ingestions/{id}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /v1/media/image-ingestions/{id}`

Requires the original source API key and current workspace policy. Repeating identical unexpired consent is idempotent; consent cannot be renewed or retargeted. The dispatch_available flag requires retained unexpired source bytes, unrevoked unclaimed consent, configured source origin and encryption; it is not an admission guarantee. Erasing the source disables dispatch without rewriting consent or accepted history. This endpoint neither claims nor dispatches an upload. Dispatch requires a configured public HTTPS source origin and separate admission checks.

Operation: `prepareImageIngestionConsent`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/v1/media/image-ingestions/{id}" \
  -H "Authorization: Bearer $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "source_id",
    "group_intent_id",
    "authorization_id",
    "valid_for_seconds",
    "confirm_ingestion"
  ],
  "properties": {
    "source_id": {
      "type": "string",
      "format": "uuid"
    },
    "group_intent_id": {
      "type": "string",
      "format": "uuid"
    },
    "authorization_id": {
      "type": "string",
      "format": "uuid"
    },
    "valid_for_seconds": {
      "type": "integer",
      "minimum": 1,
      "maximum": 900
    },
    "confirm_ingestion": {
      "type": "boolean",
      "const": true
    }
  }
}
```

## Responses

### HTTP 200

Identical active consent already exists

### HTTP 201

Consent saved; returns data with consent_id, expires_at, status, consent_revoked and dispatch_available

### HTTP 400

Invalid or unconfirmed consent

### HTTP 401

Active API key required

### HTTP 403

Current workspace policy required

### HTTP 409

Source, destination or reviewed authorization unavailable; consent conflict

## Behavior and supported scope

Requires the original source API key and current workspace policy. Repeating identical unexpired consent is idempotent; consent cannot be renewed or retargeted. The dispatch_available flag requires retained unexpired source bytes, unrevoked unclaimed consent, configured source origin and encryption; it is not an admission guarantee. Erasing the source disables dispatch without rewriting consent or accepted history. This endpoint neither claims nor dispatches an upload. Dispatch requires a configured public HTTPS source origin and separate admission checks.

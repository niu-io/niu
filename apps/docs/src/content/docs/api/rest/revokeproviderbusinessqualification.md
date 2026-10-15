---
title: "Revoke the current Provider business qualification"
description: "POST /api/v1/providers/{provider}/qualification/revoke"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/providers/{provider}/qualification/revoke`

Platform administration required. Appends an immutable reason digest and audit, clears the current business review, and pauses all Provider offers while clearing their current reviews atomically. Missing/deleted Provider or absence of a current review conflicts, including repeated revocation. Does not erase historical reviews or change existing request charges or earnings.

Operation: `revokeProviderBusinessQualification`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/providers/{provider}/qualification/revoke" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN" \
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "reason_sha256"
  ],
  "properties": {
    "reason_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
    }
  }
}
```

## Responses

### HTTP 200

Qualification transaction committed.

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
        "qualification_status"
      ],
      "properties": {
        "qualification_status": {
          "type": "string",
          "enum": [
            "revoked"
          ]
        }
      }
    }
  }
}
```

### HTTP 400

Invalid path UUID, malformed JSON, evidence digest, expiry or review metadata.

### HTTP 401

Missing or invalid administrator authentication.

### HTTP 403

Authenticated principal lacks platform management permission.

### HTTP 409

Missing resource or qualification/revision prerequisites no longer hold.

### HTTP 415

Request is not JSON.

### HTTP 422

JSON has missing, unknown or incorrectly typed fields.

### HTTP 500

Unexpected internal persistence failure.

### HTTP 503

Persistence temporarily unavailable; no successful qualification is confirmed.

## Behavior and supported scope

Platform administration required. Appends an immutable reason digest and audit, clears the current business review, and pauses all Provider offers while clearing their current reviews atomically. Missing/deleted Provider or absence of a current review conflicts, including repeated revocation. Does not erase historical reviews or change existing request charges or earnings.

**Supported scope:** implemented

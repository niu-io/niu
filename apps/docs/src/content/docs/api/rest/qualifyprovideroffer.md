---
title: "Record a Provider offer qualification review"
description: "PUT /api/v1/providers/{provider}/offers/{offer}/qualification"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/providers/{provider}/offers/{offer}/qualification`

Platform administration required. Requires current Provider business qualification, matching current rate_revision and a current media offer binding where applicable; otherwise 409. Records a new immutable review and audit, then selects that review. Evidence digests must represent independently reviewed facts; this operation does not validate their content, negotiate rates, call upstream or activate the offer.

Operation: `qualifyProviderOffer`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/providers/{provider}/offers/{offer}/qualification" \
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
    "rate_revision",
    "model_identity_sha256",
    "protocol_matrix_sha256",
    "data_handling_sha256",
    "availability_sha256",
    "agreed_rates_sha256",
    "protocol_matrix_version",
    "valid_until_ms"
  ],
  "properties": {
    "rate_revision": {
      "type": "string",
      "format": "uuid",
      "description": "Must equal the current immutable offer rate revision."
    },
    "model_identity_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
    },
    "protocol_matrix_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
    },
    "data_handling_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
    },
    "availability_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
    },
    "agreed_rates_sha256": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 digest of independently reviewed evidence; lowercase hexadecimal. Evidence content is not uploaded by this operation."
    },
    "protocol_matrix_version": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Nonblank after trimming; at most 100 UTF-8 bytes before trimming; no control characters. Saved trimmed."
    },
    "valid_until_ms": {
      "type": "integer",
      "format": "int64",
      "maximum": 253402300799999,
      "description": "Unix epoch milliseconds; must be strictly later than server time."
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
            "qualified"
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

Platform administration required. Requires current Provider business qualification, matching current rate_revision and a current media offer binding where applicable; otherwise 409. Records a new immutable review and audit, then selects that review. Evidence digests must represent independently reviewed facts; this operation does not validate their content, negotiate rates, call upstream or activate the offer.

**Supported scope:** implemented

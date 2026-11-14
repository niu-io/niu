---
title: "Create an organization and its initial zero-funded account"
description: "POST /api/v1/organizations"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations`

Authorized for installation administrators and authenticated member accounts. Atomically creates the organization, a durable URL-safe slug, and an initial account in the configured platform currency (USD for legacy installations before currency setup), with zero funding and zero approved credit. When called by a member session, also provisions an organization-wide owner membership for the account. The current session keeps its existing organization until an explicit PUT /api/v1/session/organization selects the new organization; switch before making scoped writes. No payment or funding receipt is recorded. Paid admission still requires permitted capacity and customer pricing. Name is validated and preserved without trimming. Optional Idempotency-Key is durable and actor-scoped: repeating the same input returns the original organization identity and current name with 201; different input returns 409. A deleted organization returns 404 without recreation. Without the header each successful call creates an organization. On uncertain outcomes retry the same key and input.

Operation: `createOrganization`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. Exactly one visible-ASCII identity; preserve it with the original input when retrying.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128,
  "pattern": "^[!-~]+$"
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
    "name"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Must contain non-whitespace text and fit within 200 UTF-8 bytes."
    },
    "slug": {
      "type": "string",
      "minLength": 1,
      "maxLength": 48,
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "description": "Optional unique slug; generated from name when omitted. The value default is reserved."
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$",
      "default": "USD"
    }
  }
}
```

## Responses

### HTTP 201

Organization identity, slug, and initial account currency.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "id",
    "slug",
    "name",
    "currency"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "slug": {
      "type": "string",
      "maxLength": 81,
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "name": {
      "type": "string"
    },
    "currency": {
      "type": "string",
      "pattern": "^[A-Z]{3}$"
    },
    "operator_id": {
      "type": "string",
      "format": "uuid",
      "description": "Provisioned owner membership identifier when created by a member session."
    }
  }
}
```

### HTTP 400

Invalid name/slug/currency, malformed JSON syntax, or invalid/repeated Idempotency-Key header.

### HTTP 401

Missing, invalid, expired or revoked management credential.

### HTTP 403

Credential lacks management access.

### HTTP 404

The organization from the original idempotent creation was deleted.

### HTTP 409

The requested slug is already in use, or Idempotency-Key was already used with different input.

### HTTP 422

Missing required field, unknown field, or invalid JSON field type.

### HTTP 503

Storage unavailable; creation outcome may be uncertain.

## Behavior and supported scope

Authorized for installation administrators and authenticated member accounts. Atomically creates the organization, a durable URL-safe slug, and an initial account in the configured platform currency (USD for legacy installations before currency setup), with zero funding and zero approved credit. When called by a member session, also provisions an organization-wide owner membership for the account. The current session keeps its existing organization until an explicit PUT /api/v1/session/organization selects the new organization; switch before making scoped writes. No payment or funding receipt is recorded. Paid admission still requires permitted capacity and customer pricing. Name is validated and preserved without trimming. Optional Idempotency-Key is durable and actor-scoped: repeating the same input returns the original organization identity and current name with 201; different input returns 409. A deleted organization returns 404 without recreation. Without the header each successful call creates an organization. On uncertain outcomes retry the same key and input.

**Supported scope:** implemented

---
title: "Atomically onboard a customer account, Default workspace, optional owner sign-in, and optional trial credit"
description: "POST /api/v1/admin/customers"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`POST /api/v1/admin/customers`

Explicit platform administration required. Commits the customer organization (or personal customer account), its currency balance account, optional Default workspace, optional owner sign-in credential (8 to 1024 bytes), and optional noncash trial credit grant in a single PostgreSQL transaction. Any validation or duplicate-email error rolls back completely without leaving partial organizations, workspaces, or operators. Supports Idempotency-Key for safe network retries.

Operation: `onboardPlatformCustomer`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/admin/customers" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional.

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
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "account_kind": {
      "type": "string",
      "enum": [
        "personal",
        "organization"
      ],
      "default": "organization"
    },
    "create_default_workspace": {
      "type": "boolean",
      "default": true
    },
    "owner": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "email",
        "password"
      ],
      "properties": {
        "name": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 200
        },
        "email": {
          "type": "string",
          "maxLength": 254
        },
        "password": {
          "type": "string",
          "minLength": 8,
          "maxLength": 1024,
          "writeOnly": true
        }
      }
    },
    "trial_credit_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[1-9][0-9]{0,18}$"
    }
  }
}
```

## Responses

### HTTP 201

Customer onboarded atomically (or identical idempotent replay returned)

### HTTP 400

Invalid customer name, email, password, or trial credit amount

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Owner email is already registered or Idempotency-Key reused with different input

## Behavior and supported scope

Explicit platform administration required. Commits the customer organization (or personal customer account), its currency balance account, optional Default workspace, optional owner sign-in credential (8 to 1024 bytes), and optional noncash trial credit grant in a single PostgreSQL transaction. Any validation or duplicate-email error rolls back completely without leaving partial organizations, workspaces, or operators. Supports Idempotency-Key for safe network retries.

**Supported scope:** implemented

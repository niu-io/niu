---
title: "Read credential request-limit history"
description: "GET /api/v1/vendors/{vendor}/request-rate-limit/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{vendor}/request-rate-limit/history`

Platform administration only. Applies to mapped inference dispatches pinned to this saved credential across workspaces and gateway instances, independent of customer key RPM. Null is unlimited; zero denies dispatch. Revision starts at string 0 and survives credential edits. Rolling 60-second admissions count dispatch, including upstream failures and uncertain outcomes; polling and connection checks are not inference dispatch. Unlimited dispatches also count when a cap is subsequently enabled. No automatic route substitution or replay. Duplicated credentials saved under different vendor IDs have independent windows. Storage operations use bounded transactions: read-only snapshots for reads and a recording transaction for updates, with transaction-local 250 ms lock and 2 s statement limits. Exceeded waits return sanitized 503; failed updates do not advance policy/history. These bounds exclude authorization and pool acquisition.

Operation: `listVendorRequestRateLimitHistory`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{vendor}/request-rate-limit/history" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

### vendor

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### before_revision

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 9223372036854776000
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current policy or descending immutable history.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "requests_per_minute",
          "revision",
          "recorded_at",
          "actor_kind",
          "actor_name"
        ],
        "properties": {
          "requests_per_minute": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "maximum": 1000000
          },
          "revision": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time"
          },
          "actor_kind": {
            "type": "string",
            "enum": [
              "installation",
              "member"
            ]
          },
          "actor_name": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid limit, revision or query.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

### HTTP 404

Credential configuration not found.

### HTTP 409

Stale revision on policy update.

### HTTP 503

Storage unavailable or bounded storage wait exceeded; no empty-success policy/history fallback.

## Behavior and supported scope

Platform administration only. Applies to mapped inference dispatches pinned to this saved credential across workspaces and gateway instances, independent of customer key RPM. Null is unlimited; zero denies dispatch. Revision starts at string 0 and survives credential edits. Rolling 60-second admissions count dispatch, including upstream failures and uncertain outcomes; polling and connection checks are not inference dispatch. Unlimited dispatches also count when a cap is subsequently enabled. No automatic route substitution or replay. Duplicated credentials saved under different vendor IDs have independent windows. Storage operations use bounded transactions: read-only snapshots for reads and a recording transaction for updates, with transaction-local 250 ms lock and 2 s statement limits. Exceeded waits return sanitized 503; failed updates do not advance policy/history. These bounds exclude authorization and pool acquisition.

**Supported scope:** implemented

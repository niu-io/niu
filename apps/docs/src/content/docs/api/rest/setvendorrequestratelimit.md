---
title: "Set upstream credential request limit"
description: "PUT /api/v1/vendors/{vendor}/request-rate-limit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/vendors/{vendor}/request-rate-limit`

Platform administration only. Applies to mapped inference dispatches pinned to this saved credential across workspaces and gateway instances, independent of customer key RPM. Null is unlimited; zero denies dispatch. Revision starts at string 0 and survives credential edits. Rolling 60-second admissions count dispatch, including upstream failures and uncertain outcomes; polling and connection checks are not inference dispatch. Unlimited dispatches also count when a cap is subsequently enabled. No automatic route substitution or replay. Duplicated credentials saved under different vendor IDs have independent windows. Storage operations use bounded transactions: read-only snapshots for reads and a recording transaction for updates, with transaction-local 250 ms lock and 2 s statement limits. Exceeded waits return sanitized 503; failed updates do not advance policy/history. These bounds exclude authorization and pool acquisition.

Operation: `setVendorRequestRateLimit`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/vendors/{vendor}/request-rate-limit" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "requests_per_minute",
    "expected_revision"
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
    "expected_revision": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Exact current revision. Concurrent stale updates return 409."
    }
  }
}
```

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
      "type": "object",
      "additionalProperties": false,
      "required": [
        "requests_per_minute",
        "revision"
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

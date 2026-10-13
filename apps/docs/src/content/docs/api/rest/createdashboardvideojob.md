---
title: "Submit a direct-channel text video job"
description: "POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs`

Initial ark-direct-v1 adapter with configured video schema. Personal routes are owner-funded. Customer-funded routes require an effective customer selling card, current qualified Supplier offer, exact route/schema, effective resolution and supported video_tokens meter; reserve qualified maximum liability before dispatch. Active workspace budgets fail closed until video budget reservation is supported. Media references, callbacks and required content inspection remain unavailable. Commits authorization and dispatch intent before one POST; no automatic retry. Uncertainty returns the Niu reference and retains customer liability. Successful explicit queries settle reported customer usage once. Client abort is not cancellation/refund. Text-only creation supports an optional workspace-scoped Idempotency-Key. Same key and JSON document return the original reference and saved status; changed input conflicts. Object field order is ignored. Concurrent and restarted retries never submit again; interrupted preparation can remain submission_unknown. Unkeyed creation is not idempotent. Live channel, result and complete recovery qualification remain pending.

Operation: `createDashboardVideoJob`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

### Idempotency-Key

Location: **header**. Optional. Workspace-scoped text-video submission identity. Reuse only with the same JSON document.

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 128
}
```

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

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
  "required": [
    "model",
    "content"
  ],
  "properties": {
    "model": {
      "type": "string"
    },
    "content": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "type",
          "text"
        ],
        "properties": {
          "type": {
            "const": "text"
          },
          "text": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    }
  },
  "additionalProperties": true
}
```

## Responses

### HTTP 202

Durable Niu reference; new submissions are unknown or submission_unknown, replays return the current saved status

### HTTP 400

Request violates the configured schema or idempotency header format

### HTTP 401

Invalid credential

### HTTP 402

Insufficient balance or missing required budget reservation; no upstream submission

### HTTP 403

Policy cannot be satisfied

### HTTP 404

Model access denied

### HTTP 409

Idempotency key reused with different input; or route, key, policy or offer changed before dispatch

### HTTP 501

Unsupported channel, billing, media or callback contract; idempotent reference-image submission is not supported

### HTTP 503

Qualified offer or original route unavailable

## Behavior and supported scope

Initial ark-direct-v1 adapter with configured video schema. Personal routes are owner-funded. Customer-funded routes require an effective customer selling card, current qualified Supplier offer, exact route/schema, effective resolution and supported video_tokens meter; reserve qualified maximum liability before dispatch. Active workspace budgets fail closed until video budget reservation is supported. Media references, callbacks and required content inspection remain unavailable. Commits authorization and dispatch intent before one POST; no automatic retry. Uncertainty returns the Niu reference and retains customer liability. Successful explicit queries settle reported customer usage once. Client abort is not cancellation/refund. Text-only creation supports an optional workspace-scoped Idempotency-Key. Same key and JSON document return the original reference and saved status; changed input conflicts. Object field order is ignored. Concurrent and restarted retries never submit again; interrupted preparation can remain submission_unknown. Unkeyed creation is not idempotent. Live channel, result and complete recovery qualification remain pending.

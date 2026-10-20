---
title: "Dispatch a prepared ordinary-group metadata update once"
description: "POST /api/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch`

Platform administrator only. Requires the exact saved workspace/account binding, retained authenticated patch and current original update qualification. Commits claim and group hold before credential release. Four execution slots, 30-second transport and 35-second outer deadline. Caller disconnect does not cancel the tracked worker. No replay or automatic retries; process loss leaves unresolved work. Acknowledgement is not read-back verification. Unacknowledged attempts remain uncertain and held, never falsely failed. No inference charge or automatic hold release.

Operation: `post--api-v1-vendors--id--asset-management-group-updates--update--dispatch`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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

### update

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
    "organization_id",
    "project_id"
  ],
  "properties": {
    "organization_id": {
      "type": "string",
      "format": "uuid"
    },
    "project_id": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```

## Responses

### HTTP 200

First outcome persisted. Uncertain does not prove the mutation was not applied.

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
        "update_id",
        "status",
        "reconciliation_required"
      ],
      "properties": {
        "update_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "acknowledged",
            "uncertain"
          ]
        },
        "reconciliation_required": {
          "const": true
        }
      }
    }
  }
}
```

### HTTP 400

Invalid authenticated patch.

### HTTP 401

Authentication required.

### HTTP 403

Platform administrator required.

### HTTP 404

Update unavailable in this account and workspace.

### HTTP 409

Update already claimed, content unavailable, qualification revoked or group held.

### HTTP 422

Malformed scope.

### HTTP 503

Execution capacity, encryption or durable completion unavailable; never automatically retry a claimed update.

## Behavior and supported scope

Platform administrator only. Requires the exact saved workspace/account binding, retained authenticated patch and current original update qualification. Commits claim and group hold before credential release. Four execution slots, 30-second transport and 35-second outer deadline. Caller disconnect does not cancel the tracked worker. No replay or automatic retries; process loss leaves unresolved work. Acknowledgement is not read-back verification. Unacknowledged attempts remain uncertain and held, never falsely failed. No inference charge or automatic hold release.

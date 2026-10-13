---
title: "Read persisted video job state"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}`

Requires a current workspace API key with access to the original model. Reads saved evidence only; performs no upstream poll, generation or settlement. Succeeded does not guarantee available results, reported usage or a settled charge. No upstream identifiers, credentials or procurement values are returned.

Operation: `retrieveDashboardVideoJob`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

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

### job

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Durable scoped state

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "object",
    "model",
    "status"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "object": {
      "const": "video.job"
    },
    "model": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "submission_unknown",
        "queued",
        "running",
        "succeeded",
        "failed",
        "unknown",
        "reconciliation_required"
      ]
    }
  }
}
```

### HTTP 401

Invalid, expired or revoked credential

### HTTP 404

Missing job, workspace mismatch or model access denied

## Behavior and supported scope

Requires a current workspace API key with access to the original model. Reads saved evidence only; performs no upstream poll, generation or settlement. Succeeded does not guarantee available results, reported usage or a settled charge. No upstream identifiers, credentials or procurement values are returned.

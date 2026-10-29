---
title: "Restore a preserved policy as a new active revision"
description: "POST /api/v1/organizations/{organization}/projects/{project}/guardrails/rollback"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/guardrails/rollback`

Requires workspace write access. Revalidates the selected policy under the current supported schema. Prior revisions remain unchanged; stale expected revisions conflict.

Operation: `post--api-v1-organizations--organization--projects--project--guardrails-rollback`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/rollback" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_revision",
    "target_revision"
  ],
  "properties": {
    "expected_revision": {
      "type": "integer",
      "minimum": 1
    },
    "target_revision": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

## Responses

### HTTP 200

New revision and restored_from_revision.

### HTTP 400

Invalid target or unsupported stored policy.

### HTTP 401

Authentication required.

### HTTP 403

Workspace write access required.

### HTTP 404

Target revision absent in this workspace.

### HTTP 409

Active revision changed.

## Behavior and supported scope

Requires workspace write access. Revalidates the selected policy under the current supported schema. Prior revisions remain unchanged; stale expected revisions conflict.

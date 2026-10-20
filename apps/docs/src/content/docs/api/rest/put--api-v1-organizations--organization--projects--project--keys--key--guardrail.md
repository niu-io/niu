---
title: "Assign a preserved workspace policy revision to an active key"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail`

Key restrictions intersect mandatory workspace restrictions and cannot weaken them. Revision zero creates an assignment; subsequent updates require its current assignment revision. An explicit null policy_revision clears only the key assignment while retaining an incremented assignment revision and immutable history. Omission is rejected. Rotation preserves assigned policies; mandatory workspace restrictions remain enforced.

Operation: `put--api-v1-organizations--organization--projects--project--keys--key--guardrail`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail" \
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
  "additionalProperties": false,
  "required": [
    "policy_revision",
    "expected_assignment_revision"
  ],
  "properties": {
    "policy_revision": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1
    },
    "expected_assignment_revision": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```

## Responses

### HTTP 200

New assignment_revision.

### HTTP 400

Invalid revision or unsupported policy.

### HTTP 401

Authentication required.

### HTTP 403

Workspace write access required.

### HTTP 404

Policy revision absent in this workspace.

### HTTP 409

Stale assignment revision or inactive, expired or foreign key.

### HTTP 422

Missing required assignment fields or malformed JSON shape.

## Behavior and supported scope

Key restrictions intersect mandatory workspace restrictions and cannot weaken them. Revision zero creates an assignment; subsequent updates require its current assignment revision. An explicit null policy_revision clears only the key assignment while retaining an incremented assignment revision and immutable history. Omission is rejected. Rotation preserves assigned policies; mandatory workspace restrictions remain enforced.

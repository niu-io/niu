---
title: "Pin a workspace policy revision or follow the active workspace policy"
description: "PUT /api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail"
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail`

Key restrictions intersect mandatory workspace restrictions and cannot weaken them. mode fixed pins policy_revision; mode active explicitly follows the workspace's current active policy and must not include policy_revision. Omission of mode keeps the historical fixed/clear behaviour for existing clients. Revision zero creates an assignment; subsequent updates require its current assignment revision. A fixed-mode explicit null policy_revision clears only the key assignment while retaining an incremented assignment revision and immutable history. Omitting policy_revision without mode active is rejected. An active assignment also removes any pinned key layer. Rotation preserves the assignment mode and pinned revision; mandatory workspace restrictions remain enforced and later workspace edits need no key re-pin in active mode.

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
    "expected_assignment_revision"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "fixed",
        "active"
      ],
      "default": "fixed",
      "description": "fixed pins policy_revision. active follows the workspace's active policy and requires policy_revision to be absent or null. Omitted mode preserves fixed-or-clear compatibility."
    },
    "policy_revision": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 1,
      "description": "Required with mode fixed to pin a saved revision, and when mode is omitted. An explicit null clears the key assignment. Must be absent or null with mode active; omission with mode active is allowed."
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

Invalid revision, incompatible mode and revision combination, unsupported policy, or missing fields.

### HTTP 401

Authentication required.

### HTTP 403

Workspace write access required.

### HTTP 404

Policy revision absent in this workspace.

### HTTP 409

Stale assignment revision or inactive, expired or foreign key.

### HTTP 422

Malformed JSON shape or unknown mode.

## Behavior and supported scope

Key restrictions intersect mandatory workspace restrictions and cannot weaken them. mode fixed pins policy_revision; mode active explicitly follows the workspace's current active policy and must not include policy_revision. Omission of mode keeps the historical fixed/clear behaviour for existing clients. Revision zero creates an assignment; subsequent updates require its current assignment revision. A fixed-mode explicit null policy_revision clears only the key assignment while retaining an incremented assignment revision and immutable history. Omitting policy_revision without mode active is rejected. An active assignment also removes any pinned key layer. Rotation preserves the assignment mode and pinned revision; mandatory workspace restrictions remain enforced and later workspace edits need no key re-pin in active mode.

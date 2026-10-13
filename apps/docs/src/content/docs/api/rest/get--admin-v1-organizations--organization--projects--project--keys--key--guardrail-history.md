---
title: "Read immutable key policy assignment history"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail/history"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail/history`

Returns at most 100 newest events with assignment/policy revisions, nullable policy name, readable actor name and creation time. Removal events have a null policy revision and name. Internal actor identifiers and credentials are excluded. History before audit support was installed is not reconstructed. Cache-Control is no-store.

Operation: `get--admin-v1-organizations--organization--projects--project--keys--key--guardrail-history`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail/history" \
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

### before_assignment_revision

Location: **query**. Optional. Exclusive cursor from next_cursor.

```json
{
  "type": "integer",
  "minimum": 1
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Data array and nullable next_cursor; an empty history returns an empty array.

### HTTP 400

Invalid cursor.

### HTTP 401

Authentication required.

### HTTP 403

Workspace read access required.

## Behavior and supported scope

Returns at most 100 newest events with assignment/policy revisions, nullable policy name, readable actor name and creation time. Removal events have a null policy revision and name. Internal actor identifiers and credentials are excluded. History before audit support was installed is not reconstructed. Cache-Control is no-store.

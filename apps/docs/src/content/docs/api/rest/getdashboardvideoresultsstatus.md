---
title: "Read saved result availability without downloading media"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results`

Requires current scoped model and compatible policy access. Returns no URLs or media content. Missing means no captured reference; unavailable includes expiry, deletion or conflicting terminal evidence. No regeneration, download or automatic query is performed.

Operation: `getDashboardVideoResultsStatus`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results" \
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

Current saved availability

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "video",
    "last_frame"
  ],
  "properties": {
    "video": {
      "type": "string",
      "enum": [
        "available",
        "missing",
        "unavailable"
      ]
    },
    "last_frame": {
      "type": "string",
      "enum": [
        "available",
        "missing",
        "unavailable"
      ]
    }
  }
}
```

### HTTP 401

Invalid credential

### HTTP 403

Workspace or policy access denied

### HTTP 404

Missing or inaccessible job

## Behavior and supported scope

Requires current scoped model and compatible policy access. Returns no URLs or media content. Missing means no captured reference; unavailable includes expiry, deletion or conflicting terminal evidence. No regeneration, download or automatic query is performed.

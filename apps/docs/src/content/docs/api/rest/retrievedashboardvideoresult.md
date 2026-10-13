---
title: "Retrieve saved media with a dashboard session and selected workspace key"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results/{kind}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results/{kind}`

Requires read access to the exact workspace and a current key permitting the original model. Reuses public result destination, type, retention and policy checks. Returns bounded attachment bytes, never a key secret or signed Supplier URL.

Operation: `retrieveDashboardVideoResult`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results/{kind}" \
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

### kind

Location: **path**. **Required.**

```json
{
  "type": "string",
  "enum": [
    "video",
    "last_frame"
  ]
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Saved bounded media with private no-store and nosniff headers

Content type: `video/mp4`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `video/webm`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `image/png`.

```json
{
  "type": "string",
  "format": "binary"
}
```

Content type: `image/jpeg`.

```json
{
  "type": "string",
  "format": "binary"
}
```

### HTTP 401

Invalid session or selected key

### HTTP 403

Workspace or policy access denied

### HTTP 404

Missing, inaccessible, locally expired or deleted reference

### HTTP 502

Safe media_result_* error category for unavailable links, rejected destinations, oversized or invalid media, or transport failure

### HTTP 503

Encryption, configuration or bounded retrieval capacity unavailable; capacity errors use media_result_busy

### HTTP 504

Overall result retrieval deadline exceeded; media_result_timeout

## Behavior and supported scope

Requires read access to the exact workspace and a current key permitting the original model. Reuses public result destination, type, retention and policy checks. Returns bounded attachment bytes, never a key secret or signed Supplier URL.

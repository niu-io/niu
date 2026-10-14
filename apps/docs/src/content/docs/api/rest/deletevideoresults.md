---
title: "Permanently remove locally saved result references"
description: "DELETE /v1/video/jobs/{id}/results"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`DELETE /v1/video/jobs/{id}/results`

Requires current workspace/model access. Removes encrypted URLs and leaves content-free markers preventing later refresh from restoring them, including unfinished jobs. Preserves status and financial records. Does not delete media held by a Provider or downloaded copies.

Operation: `deleteVideoResults`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  },
  {
    "niuApiKeyAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X DELETE "$NIU_ORIGIN/v1/video/jobs/{id}/results" \
  -H "Authorization: Bearer $NIU_API_KEY"
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Result references deleted

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "deleted"
  ],
  "properties": {
    "deleted": {
      "const": true
    }
  }
}
```

### HTTP 401

Invalid, expired or revoked key

### HTTP 404

Inaccessible or missing job

## Behavior and supported scope

Requires current workspace/model access. Removes encrypted URLs and leaves content-free markers preventing later refresh from restoring them, including unfinished jobs. Preserves status and financial records. Does not delete media held by a Provider or downloaded copies.

---
title: "Retrieve fresh output from the original Video task"
description: "POST /v1/video/jobs/{id}/results/{kind}/refresh"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/video/jobs/{id}/results/{kind}/refresh`

Explicitly queries the original upstream video task once using the immutable original Provider/account/model/channel binding and delivers bounded media bytes without rewriting cached references. Requires a current workspace API key or a workspace session with X-Niu-Key-Id and Write permission.

Operation: `retrieveFreshVideoResult`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/jobs/{id}/results/{kind}/refresh" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/jobs/{id}/results/{kind}/refresh" \
  -H "X-Niu-API-Key: $NIU_API_KEY"
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

Bounded media bytes

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

### HTTP 400

Invalid kind or request

### HTTP 401

Invalid, expired or revoked credential

### HTTP 403

Permission or guardrail policy denied

### HTTP 404

Task or requested result missing

### HTTP 409

Original Provider binding changed or query already claimed

### HTTP 502

Upstream query or result delivery failed

### HTTP 503

Storage or bounded delivery unavailable

### HTTP 504

Upstream query or delivery timed out

## Behavior and supported scope

Explicitly queries the original upstream video task once using the immutable original Provider/account/model/channel binding and delivers bounded media bytes without rewriting cached references. Requires a current workspace API key or a workspace session with X-Niu-Key-Id and Write permission.

**Supported scope:** implemented

---
title: "Retrieve a bounded saved video or last frame"
description: "GET /v1/video/jobs/{id}/results/{kind}"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/video/jobs/{id}/results/{kind}`

Requires current workspace/model and compatible Guardrail access, checked again after retrieval. Uses encrypted references with a fixed 24-hour retention window. URLs may expire sooner. Never returns or redirects to a signed Supplier URL. Supports MP4/WebM up to 64 MiB and PNG/JPEG up to 10 MiB; no Range support or automatic retry. Local transport tests do not qualify a live channel.

Operation: `retrieveVideoResult`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/video/jobs/{id}/results/{kind}" \
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

Attachment with private no-store caching and nosniff headers

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

Unknown result kind

### HTTP 401

Invalid, expired or revoked key

### HTTP 403

Required policy cannot be satisfied

### HTTP 404

Inaccessible, missing, locally expired or deleted reference

### HTTP 502

Safe media_result_* error category for unavailable links, rejected destinations, oversized or invalid media, or transport failure

### HTTP 503

Encryption, configuration or bounded retrieval capacity unavailable; capacity errors use media_result_busy

### HTTP 504

Overall result retrieval deadline exceeded; media_result_timeout

## Behavior and supported scope

Requires current workspace/model and compatible Guardrail access, checked again after retrieval. Uses encrypted references with a fixed 24-hour retention window. URLs may expire sooner. Never returns or redirects to a signed Supplier URL. Supports MP4/WebM up to 64 MiB and PNG/JPEG up to 10 MiB; no Range support or automatic retry. Local transport tests do not qualify a live channel.

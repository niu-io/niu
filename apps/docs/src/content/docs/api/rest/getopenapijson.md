---
title: "Download the public OpenAPI 3.1 JSON specification"
description: "GET /openapi.json"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`GET /openapi.json`

Public, bundled OpenAPI 3.1 JSON document covering Niu's model runtime, console, and customer management APIs with x-niu-authority metadata. Excludes confidential platform/provider procurement schemas.

Operation: `getOpenApiJson`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/openapi.json"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Bundled OpenAPI 3.1 JSON specification.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "openapi",
    "info",
    "paths"
  ],
  "properties": {
    "openapi": {
      "type": "string"
    },
    "info": {
      "type": "object"
    },
    "paths": {
      "type": "object"
    }
  }
}
```

## Behavior and supported scope

Public, bundled OpenAPI 3.1 JSON document covering Niu's model runtime, console, and customer management APIs with x-niu-authority metadata. Excludes confidential platform/provider procurement schemas.

**Supported scope:** implemented

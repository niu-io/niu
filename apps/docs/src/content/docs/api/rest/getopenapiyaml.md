---
title: "Download the public OpenAPI 3.1 YAML specification"
description: "GET /openapi.yaml"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

`GET /openapi.yaml`

Public, bundled OpenAPI 3.1 YAML document covering Niu's model runtime, console, and customer management APIs with x-niu-authority metadata. Excludes confidential platform/provider procurement schemas.

Operation: `getOpenApiYaml`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/openapi.yaml"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Bundled OpenAPI 3.1 YAML specification.

Content type: `application/yaml`.

```json
{
  "type": "string"
}
```

## Behavior and supported scope

Public, bundled OpenAPI 3.1 YAML document covering Niu's model runtime, console, and customer management APIs with x-niu-authority metadata. Excludes confidential platform/provider procurement schemas.

**Supported scope:** implemented

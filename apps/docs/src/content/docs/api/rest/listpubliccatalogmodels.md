---
title: "List model aliases explicitly published by the gateway operator"
description: "GET /catalog/v1/models"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /catalog/v1/models`

Returns only aliases with public_catalog enabled. Provider names, upstream identifiers, endpoints and credentials are omitted. Public catalog metadata includes provider-advertised prices, which do not configure billing.

Operation: `listPublicCatalogModels`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/catalog/v1/models"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Public model aliases and declared capabilities. generation_capabilities reports configured Chat/Video preview support, with null Chat for unresolved legacy metadata; it never grants inference authority.

## Behavior and supported scope

Returns only aliases with public_catalog enabled. Provider names, upstream identifiers, endpoints and credentials are omitted. Public catalog metadata includes provider-advertised prices, which do not configure billing.

---
title: "List model aliases explicitly published by the gateway operator"
description: "GET /catalog/v1/models"
tableOfContents: false
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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/catalog/v1/models"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Public model aliases and declared capabilities.

## Behavior and supported scope

Returns only aliases with public_catalog enabled. Provider names, upstream identifiers, endpoints and credentials are omitted. Public catalog metadata includes provider-advertised prices, which do not configure billing.

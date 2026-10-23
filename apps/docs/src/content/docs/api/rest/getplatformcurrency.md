---
title: "Read the configured platform currency"
description: "GET /v1/currency"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /v1/currency`

Returns the durable installation currency, or null until platform setup is completed. No credentials or financial balances are exposed.

Operation: `getPlatformCurrency`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/v1/currency"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

data.currency is an ISO currency code, or null before setup.

## Behavior and supported scope

Returns the durable installation currency, or null until platform setup is completed. No credentials or financial balances are exposed.

**Supported scope:** implemented

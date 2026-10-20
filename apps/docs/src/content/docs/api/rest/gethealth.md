---
title: "Check process health"
description: "GET /healthz"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /healthz`



Operation: `getHealth`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/healthz"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

The Niu process is serving requests.

## Behavior and supported scope

---
title: "Discover supported Provider service adapters"
description: "GET /api/v1/providers/presets"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/providers/presets`

Platform administration required. Returns connection instructions and observed price-source support, not saved connections, inventory, entitlements or invoice prices. OpenAI-compatible transport never establishes price compatibility. No upstream request is issued.

Operation: `listProviderPresets`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "bearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/providers/presets" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Prepared Provider descriptors.

## Behavior and supported scope

Platform administration required. Returns connection instructions and observed price-source support, not saved connections, inventory, entitlements or invoice prices. OpenAI-compatible transport never establishes price compatibility. No upstream request is issued.

**Supported scope:** implemented

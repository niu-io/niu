---
title: "Read the active routing generation"
description: "GET /api/v1/routing-registry"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/routing-registry`

Platform administrators can read the active immutable routing generation for diagnostics and an explicit static-configuration replacement. No definitions, endpoints, credential references, secrets or purchase prices are returned. local_static_configuration_matches is false on a Gateway whose local static configuration has been superseded; new inference on that instance fails closed until it restarts with matching configuration. The response is not cached.

Operation: `getRoutingRegistryStatus`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/routing-registry" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Active publication status

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "generation",
        "format_version",
        "local_static_configuration_matches"
      ],
      "properties": {
        "generation": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "format_version": {
          "type": "integer",
          "enum": [
            1
          ]
        },
        "local_static_configuration_matches": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### HTTP 401

Missing or invalid authorization

### HTTP 403

Platform administration is required

### HTTP 503

Publication is unavailable or its format is unsupported

## Behavior and supported scope

Platform administrators can read the active immutable routing generation for diagnostics and an explicit static-configuration replacement. No definitions, endpoints, credential references, secrets or purchase prices are returned. local_static_configuration_matches is false on a Gateway whose local static configuration has been superseded; new inference on that instance fails closed until it restarts with matching configuration. The response is not cached.

**Supported scope:** implemented

---
title: "Discover upstream models for a Provider API-key configuration"
description: "GET /api/v1/vendors/{id}/catalog"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/vendors/{id}/catalog`

Makes a bounded GET to the configured provider /models endpoint using the encrypted server-side credential. Anthropic uses x-api-key and anthropic-version 2023-06-01; Gemini uses x-goog-api-key and normalizes native model resource names. Both request at most 1000 models and reject an incomplete catalog rather than returning a truncated inventory. No inference request is sent. Redirects are blocked, the response body is capped at 2 MiB, and only allowlisted model IDs and catalog metadata (display name, description, context and output limits, modalities, and advertised USD token prices) are returned. Provider credentials and raw response data are never returned. Requires installation administration or an explicitly granted platform administrator.

Operation: `listProviderModelCatalog`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/vendors/{id}/catalog" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Provider model metadata wrapped in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "maxItems": 2000,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "context_length",
          "catalog"
        ],
        "properties": {
          "catalog": {
            "type": "object",
            "additionalProperties": false,
            "description": "Descriptive provider metadata, stored under capabilities.catalog on vendor mappings and exposed as catalog on model listings. Advertised USD per-token prices are separate from billing rates. Missing values mean unknown, never zero.",
            "properties": {
              "name": {
                "type": [
                  "string",
                  "null"
                ],
                "maxLength": 300
              },
              "description": {
                "type": [
                  "string",
                  "null"
                ],
                "maxLength": 12000
              },
              "context_length": {
                "type": [
                  "integer",
                  "null"
                ],
                "minimum": 1
              },
              "max_completion_tokens": {
                "type": [
                  "integer",
                  "null"
                ],
                "minimum": 1
              },
              "input_modalities": {
                "type": "array",
                "maxItems": 16,
                "items": {
                  "type": "string",
                  "maxLength": 40
                }
              },
              "output_modalities": {
                "type": "array",
                "maxItems": 16,
                "items": {
                  "type": "string",
                  "maxLength": 40
                }
              },
              "supported_parameters": {
                "type": "array",
                "maxItems": 64,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 80
                }
              },
              "input_price": {
                "type": [
                  "string",
                  "null"
                ],
                "maxLength": 64,
                "description": "Advertised USD per input token."
              },
              "output_price": {
                "type": [
                  "string",
                  "null"
                ],
                "maxLength": 64,
                "description": "Advertised USD per output token."
              }
            }
          },
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200,
            "description": "Provider model ID used for inference routing."
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 300,
            "description": "Display name supplied by the provider."
          },
          "context_length": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 1
          }
        }
      }
    }
  }
}
```

### HTTP 401

Invalid or expired administrative credential.

### HTTP 403

Platform administration permission required.

### HTTP 404

Vendor does not exist.

### HTTP 502

Provider rejected the credential or returned an invalid catalog or request error.

## Behavior and supported scope

Makes a bounded GET to the configured provider /models endpoint using the encrypted server-side credential. Anthropic uses x-api-key and anthropic-version 2023-06-01; Gemini uses x-goog-api-key and normalizes native model resource names. Both request at most 1000 models and reject an incomplete catalog rather than returning a truncated inventory. No inference request is sent. Redirects are blocked, the response body is capped at 2 MiB, and only allowlisted model IDs and catalog metadata (display name, description, context and output limits, modalities, and advertised USD token prices) are returned. Provider credentials and raw response data are never returned. Requires installation administration or an explicitly granted platform administrator.

**Supported scope:** implemented

---
title: "Estimate a configured text-video request without submission"
description: "POST /v1/video/estimate"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /v1/video/estimate`

Checks current key/model, route, capability, tariff and policy access. Performs no upstream request, job creation, reservation or debit. Estimates are not binding quotes, final charges or admission guarantees. Submission rechecks current configuration and available funds. Owner-funded amounts remain null; missing output estimators and unqualified contracts are unavailable.

Operation: `estimateVideoGeneration`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

Authentication alternative: `bearerAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/estimate" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

Authentication alternative: `niuApiKeyAuth`.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/v1/video/estimate" \
  -H "X-Niu-API-Key: $NIU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data @request.json
```

## Parameters

No path, query, or header parameters are declared.

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "required": [
    "model",
    "content"
  ],
  "additionalProperties": true,
  "properties": {
    "model": {
      "type": "string"
    },
    "content": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "type",
          "text"
        ],
        "properties": {
          "type": {
            "const": "text"
          },
          "text": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Nonbinding estimate and independently reviewed maximum charge

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "object",
    "model",
    "mode",
    "effective_output",
    "estimate",
    "maximum_charge_nanos",
    "selected_at"
  ],
  "properties": {
    "object": {
      "const": "video.estimate"
    },
    "model": {
      "type": "string"
    },
    "mode": {
      "type": "string",
      "enum": [
        "owner_funded",
        "customer"
      ]
    },
    "effective_output": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Saved estimated quantity priced using the original customer tariff. Neither confirmed usage, maximum liability nor a final charge. Owner-funded or unpriceable amounts remain null.",
      "required": [
        "meter",
        "quantity",
        "provenance",
        "currency",
        "amount_nanos"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "quantity": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "numerator",
            "denominator"
          ],
          "properties": {
            "numerator": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "denominator": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$"
            }
          }
        },
        "provenance": {
          "type": "string",
          "enum": [
            "Estimate"
          ]
        },
        "currency": {
          "type": [
            "string",
            "null"
          ]
        },
        "amount_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        }
      }
    },
    "estimate": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Saved estimated quantity priced using the original customer tariff. Neither confirmed usage, maximum liability nor a final charge. Owner-funded or unpriceable amounts remain null.",
      "required": [
        "meter",
        "quantity",
        "provenance",
        "currency",
        "amount_nanos"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "quantity": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "numerator",
            "denominator"
          ],
          "properties": {
            "numerator": {
              "type": "string",
              "pattern": "^[0-9]+$"
            },
            "denominator": {
              "type": "string",
              "pattern": "^[1-9][0-9]*$"
            }
          }
        },
        "provenance": {
          "type": "string",
          "enum": [
            "Estimate"
          ]
        },
        "currency": {
          "type": [
            "string",
            "null"
          ]
        },
        "amount_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        }
      }
    },
    "maximum_charge_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Customer maximum from separately reviewed liability; not funds reserved by this read."
    },
    "selected_at": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$",
      "description": "Customer tariff selection time in Unix seconds; does not guarantee future availability."
    }
  }
}
```

### HTTP 400

Request violates configured capabilities

### HTTP 401

Invalid credential

### HTTP 403

Policy cannot be satisfied

### HTTP 404

Model access denied

### HTTP 501

Unsupported channel, meter, estimator, media or callback contract

### HTTP 503

Qualified route or original tariff binding unavailable

## Behavior and supported scope

Checks current key/model, route, capability, tariff and policy access. Performs no upstream request, job creation, reservation or debit. Estimates are not binding quotes, final charges or admission guarantees. Submission rechecks current configuration and available funds. Owner-funded amounts remain null; missing output estimators and unqualified contracts are unavailable.

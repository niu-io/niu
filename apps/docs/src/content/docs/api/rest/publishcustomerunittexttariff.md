---
title: "Publish a versioned Credits text consumption tariff"
description: "POST /api/v1/platform/units/tariffs"
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/platform/units/tariffs`

Platform administration required and rechecked transactionally for operators. Publish atom-denominated rates independently of purchase conversion and monetary tariffs. New publication requires the current unit definition and installation revision. Concurrent stale writes conflict. Equal idempotent retries return their original normalized publication, even after later price or unit changes; changed input conflicts. Rates and quantity thresholds use exact decimal strings; context thresholds are unique and normalized in ascending order. Nullable category rates use ordinary rates, never inherit another tier. Rates are per million tokens, rounded upward once after adding applicable exact token products. Add the fixed request fee, then apply the minimum charge. Explicit zero is valid; absence of a publication is unavailable. Publishing a tariff does not activate billing mode, issue Credits, convert money balances, admit requests or change prior request bindings.

Operation: `publishCustomerUnitTextTariff`.

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
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/platform/units/tariffs" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN" \
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
  "additionalProperties": false,
  "required": [
    "model_alias",
    "definition_revision",
    "expected_revision",
    "idempotency_key",
    "price"
  ],
  "properties": {
    "model_alias": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "definition_revision": {
      "type": "string",
      "pattern": "^[1-9][0-9]{0,18}$"
    },
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]{0,18})$"
    },
    "idempotency_key": {
      "type": "string",
      "format": "uuid"
    },
    "price": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "prompt_rate",
        "completion_rate",
        "request_fee_atoms",
        "minimum_charge_atoms",
        "context_tiers"
      ],
      "properties": {
        "prompt_rate": {
          "type": "string",
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "completion_rate": {
          "type": "string",
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "cached_prompt_rate": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "cache_write_prompt_rate": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "reasoning_completion_rate": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "request_fee_atoms": {
          "type": "string",
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "minimum_charge_atoms": {
          "type": "string",
          "pattern": "^[0-9]{1,16}$",
          "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
        },
        "context_tiers": {
          "type": "array",
          "maxItems": 32,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum_input_tokens",
              "prompt_rate",
              "completion_rate"
            ],
            "properties": {
              "minimum_input_tokens": {
                "type": "string",
                "pattern": "^[1-9][0-9]{0,18}$"
              },
              "prompt_rate": {
                "type": "string",
                "pattern": "^[0-9]{1,16}$",
                "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
              },
              "completion_rate": {
                "type": "string",
                "pattern": "^[0-9]{1,16}$",
                "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
              },
              "cached_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]{1,16}$",
                "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
              },
              "cache_write_prompt_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]{1,16}$",
                "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
              },
              "reasoning_completion_rate": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^[0-9]{1,16}$",
                "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
              }
            }
          }
        }
      }
    }
  }
}
```

## Responses

### HTTP 200

Original immutable Credits text tariff

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "additionalProperties": false,
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "revision",
        "definition_revision",
        "model_alias",
        "price"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$"
        },
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]{0,18}$"
        },
        "model_alias": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "price": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "prompt_rate",
            "completion_rate",
            "request_fee_atoms",
            "minimum_charge_atoms",
            "context_tiers"
          ],
          "properties": {
            "prompt_rate": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "completion_rate": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "cached_prompt_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "cache_write_prompt_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "reasoning_completion_rate": {
              "type": [
                "string",
                "null"
              ],
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "request_fee_atoms": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "minimum_charge_atoms": {
              "type": "string",
              "pattern": "^[0-9]{1,16}$",
              "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
            },
            "context_tiers": {
              "type": "array",
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "minimum_input_tokens",
                  "prompt_rate",
                  "completion_rate"
                ],
                "properties": {
                  "minimum_input_tokens": {
                    "type": "string",
                    "pattern": "^[1-9][0-9]{0,18}$"
                  },
                  "prompt_rate": {
                    "type": "string",
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "completion_rate": {
                    "type": "string",
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "cached_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "cache_write_prompt_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  },
                  "reasoning_completion_rate": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "pattern": "^[0-9]{1,16}$",
                    "description": "Exact integer Credits atoms, from 0 through 1000000000000000. Token rates are atoms per million tokens; fixed fees are atoms per completed request."
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### HTTP 400

Invalid model, exact quantity or context schedule

### HTTP 401

Authentication unavailable or revoked

### HTTP 403

Platform administration required

### HTTP 409

Stale installation/unit revision or conflicting idempotency input

### HTTP 422

Malformed request

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required and rechecked transactionally for operators. Publish atom-denominated rates independently of purchase conversion and monetary tariffs. New publication requires the current unit definition and installation revision. Concurrent stale writes conflict. Equal idempotent retries return their original normalized publication, even after later price or unit changes; changed input conflicts. Rates and quantity thresholds use exact decimal strings; context thresholds are unique and normalized in ascending order. Nullable category rates use ordinary rates, never inherit another tier. Rates are per million tokens, rounded upward once after adding applicable exact token products. Add the fixed request fee, then apply the minimum charge. Explicit zero is valid; absence of a publication is unavailable. Publishing a tariff does not activate billing mode, issue Credits, convert money balances, admit requests or change prior request bindings.

**Supported scope:** implemented

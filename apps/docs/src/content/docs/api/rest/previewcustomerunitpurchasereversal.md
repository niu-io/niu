---
title: "Preview a Credits purchase reversal and read committed reversal receipts"
description: "GET /api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals`

Platform administration required. Evaluates the unoccupied (unconsumed, unreserved and unreversed) ranges of an original Credits purchase lot and computes the exact processor-representable refund amount (whole minor units of 10000000 nanounits), the reversible atom prefix and any residual atoms or monetary backing that cannot be represented at processor precision without discarding value. Also returns all previously committed reversal receipts on the order. Consumed ranges require an explicit charge refund before they become reversible. Does not mutate state or execute an external payment refund.

Operation: `previewCustomerUnitPurchaseReversal`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### organization

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### order

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### credit_atoms

Location: **query**. Optional. Optional target unoccupied atom prefix to evaluate; defaults to all currently available unoccupied atoms on the purchase lot.

```json
{
  "type": "string",
  "pattern": "^[1-9][0-9]*$"
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Purchase reversal preview and committed reversal history

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "order_id",
        "lot_id",
        "definition_revision",
        "name",
        "display_precision",
        "atoms_per_unit",
        "provenance",
        "payment_currency",
        "processor_minor_unit_nanos",
        "payment_nanos",
        "backing_nanos",
        "issued_atoms",
        "held_atoms",
        "charged_atoms",
        "restored_atoms",
        "reversed_atoms",
        "available_atoms",
        "available_payment_nanos",
        "available_backing_nanos",
        "requested_atoms",
        "reversible_atoms",
        "refund_payment_nanos",
        "refund_backing_nanos",
        "residual_credit_atoms",
        "residual_payment_nanos",
        "residual_backing_nanos",
        "ranges",
        "reversals"
      ],
      "properties": {
        "order_id": {
          "type": "string",
          "format": "uuid"
        },
        "lot_id": {
          "type": "string",
          "format": "uuid"
        },
        "definition_revision": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "name": {
          "type": "string"
        },
        "display_precision": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9
        },
        "atoms_per_unit": {
          "type": "string",
          "const": "1000000000"
        },
        "provenance": {
          "type": "string",
          "enum": [
            "purchased",
            "simulated"
          ]
        },
        "payment_currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        },
        "processor_minor_unit_nanos": {
          "type": "string",
          "const": "10000000"
        },
        "payment_nanos": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "backing_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "issued_atoms": {
          "type": "string",
          "pattern": "^[1-9][0-9]*$"
        },
        "held_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "charged_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "restored_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "reversed_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "available_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "available_payment_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "available_backing_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "requested_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "reversible_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "refund_payment_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "refund_backing_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "residual_credit_atoms": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "residual_payment_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "residual_backing_nanos": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        },
        "ranges": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "first_atom",
              "end_atom",
              "credit_atoms",
              "payment_nanos",
              "backing_nanos"
            ],
            "properties": {
              "first_atom": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "end_atom": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "credit_atoms": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "payment_nanos": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "backing_nanos": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              }
            }
          }
        },
        "reversals": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "order_id",
              "lot_id",
              "definition_revision",
              "name",
              "display_precision",
              "atoms_per_unit",
              "provenance",
              "payment_currency",
              "processor_minor_unit_nanos",
              "credit_atoms",
              "refund_payment_nanos",
              "refund_backing_nanos",
              "reason",
              "created_at",
              "ranges"
            ],
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid"
              },
              "order_id": {
                "type": "string",
                "format": "uuid"
              },
              "lot_id": {
                "type": "string",
                "format": "uuid"
              },
              "definition_revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "name": {
                "type": "string"
              },
              "display_precision": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9
              },
              "atoms_per_unit": {
                "type": "string",
                "const": "1000000000"
              },
              "provenance": {
                "type": "string",
                "enum": [
                  "purchased",
                  "simulated"
                ]
              },
              "payment_currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              },
              "processor_minor_unit_nanos": {
                "type": "string",
                "const": "10000000"
              },
              "credit_atoms": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "refund_payment_nanos": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "refund_backing_nanos": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "reason": {
                "type": "string"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "ranges": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "first_atom",
                    "end_atom",
                    "credit_atoms",
                    "payment_nanos",
                    "backing_nanos"
                  ],
                  "properties": {
                    "first_atom": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]*)$"
                    },
                    "end_atom": {
                      "type": "string",
                      "pattern": "^[1-9][0-9]*$"
                    },
                    "credit_atoms": {
                      "type": "string",
                      "pattern": "^[1-9][0-9]*$"
                    },
                    "payment_nanos": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]*)$"
                    },
                    "backing_nanos": {
                      "type": "string",
                      "pattern": "^(0|[1-9][0-9]*)$"
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
}
```

### HTTP 400

Invalid query parameter

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 404

No settled Credits purchase lot for the specified organization and order

### HTTP 409

Requested atoms exceed currently available unoccupied purchase capacity

### HTTP 503

Storage unavailable

## Behavior and supported scope

Platform administration required. Evaluates the unoccupied (unconsumed, unreserved and unreversed) ranges of an original Credits purchase lot and computes the exact processor-representable refund amount (whole minor units of 10000000 nanounits), the reversible atom prefix and any residual atoms or monetary backing that cannot be represented at processor precision without discarding value. Also returns all previously committed reversal receipts on the order. Consumed ranges require an explicit charge refund before they become reversible. Does not mutate state or execute an external payment refund.

**Supported scope:** implemented

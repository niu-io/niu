---
title: "Read exact Credits quantities by original definition and provenance"
description: "GET /api/v1/organizations/{organization}/billing/units"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/units`

Organization-wide billing owner/admin or installation read access required. One database statement reports original issuance, unresolved held ranges, gross charged ranges, original-range restorations, expired unheld remainder and available unexpired remainder. Expiry never releases an unresolved request hold or renews a restored lot. For each group, issued + restored = held + charged + expired + available. A balance is not proof that inference routes, tariffs or admission are configured. Historical unit definitions remain separate. No payment backing, procurement rates or financial margin enters this response. Quantities are exact decimal strings; an empty array means no issuance. Reads do not activate Credits or convert monetary balances.

Operation: `getCustomerUnitBalance`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/units" \
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

## Request body

No request body is declared.

## Responses

### HTTP 200

Current unit balance snapshot

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
        "billing_mode",
        "atoms_per_unit",
        "definition",
        "purchase_rules",
        "balances",
        "purchases",
        "recent_charges"
      ],
      "properties": {
        "billing_mode": {
          "type": "string",
          "enum": [
            "currency",
            "credits"
          ]
        },
        "atoms_per_unit": {
          "type": "string",
          "const": "1000000000"
        },
        "definition": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "revision",
            "name",
            "display_precision",
            "atoms_per_unit"
          ],
          "properties": {
            "revision": {
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
            }
          }
        },
        "purchase_rules": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "revision",
              "definition_revision",
              "payment_currency",
              "numerator",
              "denominator"
            ],
            "properties": {
              "revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "definition_revision": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "payment_currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              },
              "numerator": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "denominator": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              }
            }
          }
        },
        "balances": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "definition_revision",
              "name",
              "display_precision",
              "provenance",
              "issued_atoms",
              "held_atoms",
              "charged_atoms",
              "restored_atoms",
              "expired_atoms",
              "available_atoms"
            ],
            "properties": {
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
              "provenance": {
                "type": "string",
                "enum": [
                  "purchased",
                  "promotional",
                  "simulated"
                ]
              },
              "issued_atoms": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
              },
              "held_atoms": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
              },
              "charged_atoms": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
              },
              "restored_atoms": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
              },
              "expired_atoms": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
              },
              "available_atoms": {
                "type": "string",
                "pattern": "^[0-9]+$",
                "description": "Exact nonnegative integer atoms. May exceed signed 64-bit range when aggregated across lots."
              }
            }
          }
        },
        "purchases": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "order_id",
              "created_at",
              "definition_revision",
              "name",
              "display_precision",
              "provenance",
              "payment_currency",
              "payment_nanos",
              "issued_atoms",
              "reversed_atoms",
              "available_atoms"
            ],
            "properties": {
              "order_id": {
                "type": "string",
                "format": "uuid"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
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
              "payment_nanos": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "issued_atoms": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "reversed_atoms": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "available_atoms": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              }
            }
          }
        },
        "recent_charges": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "attempt_id",
              "reference",
              "charged_at",
              "model_alias",
              "definition_revision",
              "name",
              "display_precision",
              "charged_atoms",
              "restored_atoms",
              "refundable_atoms"
            ],
            "properties": {
              "attempt_id": {
                "type": "string",
                "format": "uuid"
              },
              "reference": {
                "type": "string"
              },
              "charged_at": {
                "type": "string",
                "format": "date-time"
              },
              "model_alias": {
                "type": "string"
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
              "charged_atoms": {
                "type": "string",
                "pattern": "^[1-9][0-9]*$"
              },
              "restored_atoms": {
                "type": "string",
                "pattern": "^(0|[1-9][0-9]*)$"
              },
              "refundable_atoms": {
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
```

### HTTP 401

Authentication unavailable or revoked

### HTTP 403

Management read access required

### HTTP 404

Company absent or outside permitted billing scope

### HTTP 503

Storage unavailable

## Behavior and supported scope

Organization-wide billing owner/admin or installation read access required. One database statement reports original issuance, unresolved held ranges, gross charged ranges, original-range restorations, expired unheld remainder and available unexpired remainder. Expiry never releases an unresolved request hold or renews a restored lot. For each group, issued + restored = held + charged + expired + available. A balance is not proof that inference routes, tariffs or admission are configured. Historical unit definitions remain separate. No payment backing, procurement rates or financial margin enters this response. Quantities are exact decimal strings; an empty array means no issuance. Reads do not activate Credits or convert monetary balances.

**Supported scope:** implemented

---
title: "Discover named customer accounts and Credits summaries for platform financial administration"
description: "GET /api/v1/platform/customer-accounts"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/platform/customer-accounts`

Explicit platform administration only, independent of ordinary company membership. Named companies, their current currency balance summaries, and a standard-unit Credits summary when issued lots exist; companies without accounts have an empty accounts array. The Credits summary exposes no atoms, lots or provenance. It is a display summary, not a spendable-capacity guarantee; the organization unit-balance endpoint remains authoritative for exact lot and expiry detail. No payment references, transactions, customer request content, Provider costs or credentials. Shares customer balance arithmetic: available equals posted balance plus approved credit minus outstanding request liability. Approval is not a cash receipt. UUID references are routing-only, never display labels. Company UUID keyset order; limit defaults to 50, maximum 100 companies. Pass next_after unchanged as after; missing cursor returns 409. Each page has one bounded read snapshot, separate pages do not share it; concurrent inserts before the cursor require refreshing. No funds, accounts or policies are created. Cache-Control no-store.

Operation: `listPlatformCustomerAccounts`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/platform/customer-accounts" \
  -H "Authorization: Bearer $NIU_BEARER_TOKEN"
```

## Parameters

### after

Location: **query**. Optional.

```json
{
  "type": "string",
  "format": "uuid"
}
```

### limit

Location: **query**. Optional.

```json
{
  "type": "integer",
  "minimum": 1,
  "maximum": 100,
  "default": 50
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Named company account page

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data",
    "next_after"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "organization_id",
          "organization_name",
          "accounts",
          "credits"
        ],
        "properties": {
          "organization_id": {
            "type": "string",
            "format": "uuid"
          },
          "organization_name": {
            "type": "string"
          },
          "accounts": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "currency",
                "balance_nanos",
                "reserved_nanos",
                "outstanding_nanos",
                "available_nanos",
                "credit_limit_nanos",
                "policy_revision",
                "warning_threshold_nanos",
                "low_balance",
                "posted_credit_exhausted"
              ],
              "properties": {
                "currency": {
                  "type": "string"
                },
                "balance_nanos": {
                  "type": "string"
                },
                "reserved_nanos": {
                  "type": "string"
                },
                "outstanding_nanos": {
                  "type": "string"
                },
                "available_nanos": {
                  "type": "string"
                },
                "credit_limit_nanos": {
                  "type": "string"
                },
                "policy_revision": {
                  "type": "string"
                },
                "warning_threshold_nanos": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "low_balance": {
                  "type": "boolean"
                },
                "posted_credit_exhausted": {
                  "type": "boolean"
                }
              }
            }
          },
          "credits": {
            "type": [
              "object",
              "null"
            ],
            "description": "Largest positive standard-unit Credits balance summary; the current definition breaks equal-amount ties. Null when the company has no issued Credits lots. Exact decimal string in standard units; no atoms, lots or provenance. additional_units counts other unit definitions with a positive balance.",
            "additionalProperties": false,
            "required": [
              "name",
              "display_precision",
              "available",
              "additional_units"
            ],
            "properties": {
              "name": {
                "type": "string"
              },
              "display_precision": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9
              },
              "available": {
                "type": "string",
                "pattern": "^-?[0-9]+(?:\\.[0-9]+)?$"
              },
              "additional_units": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    },
    "next_after": {
      "type": [
        "string",
        "null"
      ],
      "format": "uuid"
    }
  }
}
```

### HTTP 400

Invalid query or page size

### HTTP 401

Authentication required

### HTTP 403

Platform administration required

### HTTP 409

Missing company cursor

## Behavior and supported scope

Explicit platform administration only, independent of ordinary company membership. Named companies, their current currency balance summaries, and a standard-unit Credits summary when issued lots exist; companies without accounts have an empty accounts array. The Credits summary exposes no atoms, lots or provenance. It is a display summary, not a spendable-capacity guarantee; the organization unit-balance endpoint remains authoritative for exact lot and expiry detail. No payment references, transactions, customer request content, Provider costs or credentials. Shares customer balance arithmetic: available equals posted balance plus approved credit minus outstanding request liability. Approval is not a cash receipt. UUID references are routing-only, never display labels. Company UUID keyset order; limit defaults to 50, maximum 100 companies. Pass next_after unchanged as after; missing cursor returns 409. Each page has one bounded read snapshot, separate pages do not share it; concurrent inserts before the cursor require refreshing. No funds, accounts or policies are created. Cache-Control no-store.

**Supported scope:** implemented

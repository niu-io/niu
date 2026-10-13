---
title: "Read saved customer video billing through a workspace session"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/billing"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/billing`

Workspace session, actor-private task visibility and current selected-key/model authorization required; no API key secret is needed. Performs no upstream query or settlement. Exact amounts are decimal nanounit strings. Only a posted customer debit is a charge; unresolved liability remains explicit. Owner-funded jobs have no Niu customer price or charge. Procurement terms and internal price revision identifiers are excluded.

Operation: `retrieveDashboardVideoBilling`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/billing" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
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

### project

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### key

Location: **path**. **Required.**

```json
{
  "type": "string",
  "format": "uuid"
}
```

### job

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

Saved customer accounting snapshot

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "mode",
    "state",
    "currency",
    "reserved_nanos",
    "charge_nanos",
    "usage",
    "price",
    "bound_exceeded",
    "effective_output",
    "estimate"
  ],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "owner_funded",
        "customer",
        "unavailable"
      ]
    },
    "state": {
      "type": "string",
      "enum": [
        "owner_funded",
        "unavailable",
        "reserved",
        "awaiting_usage",
        "awaiting_settlement",
        "settled",
        "reconciliation_required"
      ]
    },
    "currency": {
      "type": [
        "string",
        "null"
      ]
    },
    "reserved_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "charge_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^[0-9]+$"
    },
    "settled_usage": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Immutable quantity behind a posted customer charge, distinct from later usage observations or conflicts.",
      "required": [
        "meter",
        "quantity",
        "billable_quantity",
        "provenance"
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
        "billable_quantity": {
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
            "Reported"
          ]
        }
      }
    },
    "bound_exceeded": {
      "type": [
        "boolean",
        "null"
      ]
    },
    "effective_output": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "description": "Immutable effective output from submission; absent for legacy jobs. Revisions identify calculation evidence, not current availability.",
      "required": [
        "specification",
        "duration_seconds",
        "frames_per_second",
        "schema_revision",
        "estimator",
        "estimator_revision"
      ],
      "properties": {
        "specification": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "resolution",
            "ratio",
            "width",
            "height"
          ],
          "properties": {
            "resolution": {
              "type": "string"
            },
            "ratio": {
              "type": "string"
            },
            "width": {
              "type": "integer",
              "minimum": 1,
              "maximum": 4294967295
            },
            "height": {
              "type": "integer",
              "minimum": 1,
              "maximum": 4294967295
            }
          }
        },
        "duration_seconds": {
          "type": "integer",
          "minimum": 1
        },
        "frames_per_second": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 1,
          "maximum": 4294967295,
          "description": "Null when the seconds estimator has no configured frame rate; required for pixel-based estimation."
        },
        "schema_revision": {
          "type": "string"
        },
        "estimator": {
          "type": "string",
          "enum": [
            "SeedancePixelsV1",
            "OutputSecondsV1"
          ]
        },
        "estimator_revision": {
          "type": "string"
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
    "usage": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "meter",
        "quantity"
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
        }
      }
    },
    "price": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "meter",
        "amount_units",
        "decimal_places",
        "per_quantity",
        "minimum_quantity",
        "rounding",
        "resolution",
        "reference_video",
        "effective_from",
        "effective_until",
        "discounts"
      ],
      "properties": {
        "meter": {
          "type": "string"
        },
        "amount_units": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "decimal_places": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9
        },
        "per_quantity": {
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
        "minimum_quantity": {
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
        "rounding": {
          "type": "string",
          "enum": [
            "Down",
            "Up",
            "HalfEven"
          ]
        },
        "resolution": {
          "type": "string"
        },
        "reference_video": {
          "type": "boolean"
        },
        "effective_from": {
          "type": "string",
          "pattern": "^-?[0-9]+$"
        },
        "effective_until": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^-?[0-9]+$"
        },
        "discounts": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "multiplier",
              "stacking",
              "effective_from",
              "effective_until"
            ],
            "properties": {
              "multiplier": {
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
              "stacking": {
                "type": "string",
                "enum": [
                  "Exclusive",
                  "Multiply"
                ]
              },
              "effective_from": {
                "type": "string",
                "pattern": "^-?[0-9]+$"
              },
              "effective_until": {
                "type": [
                  "string",
                  "null"
                ],
                "pattern": "^-?[0-9]+$"
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

Invalid session or selected key

### HTTP 403

Workspace or selected-model access denied

### HTTP 404

Job missing or inaccessible to the selected key

## Behavior and supported scope

Workspace session, actor-private task visibility and current selected-key/model authorization required; no API key secret is needed. Performs no upstream query or settlement. Exact amounts are decimal nanounit strings. Only a posted customer debit is a charge; unresolved liability remains explicit. Owner-funded jobs have no Niu customer price or charge. Procurement terms and internal price revision identifiers are excluded.

**Supported scope:** implemented

---
title: "Read saved customer billing and transport diagnostics"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/diagnostics"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/diagnostics`

Current dashboard workspace Read authorizes persisted diagnostics independently of the original inference key expiry, revocation or model grants. Actor-private tasks belonging to another actor are 404. Billing is customer-only; owner-funded jobs retain null customer charges and never expose procurement costs. Billing and measured transport/lifecycle observations share one bounded read-only snapshot. This GET never contacts a Provider, polls, refreshes, retries, submits or settles a task. Errors are explicit; no successful empty result hides a storage failure.

Operation: `generationsTaskDiagnostics`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/diagnostics" \
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

### task

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

Persisted customer diagnostics

Content type: `application/json`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "billing",
    "timings"
  ],
  "properties": {
    "billing": {
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
    },
    "timings": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "data",
        "has_more",
        "lifecycle"
      ],
      "properties": {
        "has_more": {
          "type": "boolean"
        },
        "data": {
          "type": "array",
          "maxItems": 100,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "phase",
              "started_unix_ms",
              "elapsed_ms",
              "outcome",
              "upstream_http_status",
              "upstream_error_code",
              "upstream_request_id"
            ],
            "properties": {
              "phase": {
                "type": "string",
                "enum": [
                  "submission",
                  "query",
                  "result"
                ]
              },
              "started_unix_ms": {
                "type": "integer",
                "minimum": 0
              },
              "elapsed_ms": {
                "type": "integer",
                "minimum": 0
              },
              "outcome": {
                "type": "string",
                "enum": [
                  "received",
                  "unavailable"
                ]
              },
              "upstream_http_status": {
                "type": [
                  "integer",
                  "null"
                ]
              },
              "upstream_error_code": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "upstream_request_id": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        },
        "lifecycle": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "source",
            "submitted_unix_ms",
            "observations",
            "conflicting_terminal"
          ],
          "properties": {
            "source": {
              "type": "string",
              "enum": [
                "gateway_observation"
              ]
            },
            "submitted_unix_ms": {
              "type": [
                "integer",
                "null"
              ]
            },
            "conflicting_terminal": {
              "type": "boolean"
            },
            "observations": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "status",
                  "observed_unix_ms"
                ],
                "properties": {
                  "status": {
                    "type": "string",
                    "enum": [
                      "queued",
                      "running",
                      "succeeded",
                      "failed",
                      "unknown"
                    ]
                  },
                  "observed_unix_ms": {
                    "type": "integer"
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

### HTTP 401

Invalid dashboard session

### HTTP 403

Workspace Read denied

### HTTP 404

Saved Video task missing or actor-private

### HTTP 503

Saved diagnostics unavailable

## Behavior and supported scope

Current dashboard workspace Read authorizes persisted diagnostics independently of the original inference key expiry, revocation or model grants. Actor-private tasks belonging to another actor are 404. Billing is customer-only; owner-funded jobs retain null customer charges and never expose procurement costs. Billing and measured transport/lifecycle observations share one bounded read-only snapshot. This GET never contacts a Provider, polls, refreshes, retries, submits or settles a task. Errors are explicit; no successful empty result hides a storage failure.

**Supported scope:** implemented

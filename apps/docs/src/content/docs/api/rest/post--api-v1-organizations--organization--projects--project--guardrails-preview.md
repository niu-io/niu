---
title: "Preview draft model and Provider access without persistence"
description: "POST /api/v1/organizations/{organization}/projects/{project}/guardrails/preview"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`POST /api/v1/organizations/{organization}/projects/{project}/guardrails/preview`

Returns allowed, coverage=model_provider_access and route_availability_checked=false. Does not check route availability, content, retention, budgets or credential grants.

Operation: `post--api-v1-organizations--organization--projects--project--guardrails-preview`.

## Authentication

Use the credential and permission scope described above. Each object below is an alternative; schemes within one object are required together.

```json
[
  {
    "adminBearerAuth": []
  }
]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X POST "$NIU_ORIGIN/api/v1/organizations/{organization}/projects/{project}/guardrails/preview" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @request.json
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

## Request body

### application/json

**Required.**



```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "policy",
    "model",
    "provider"
  ],
  "properties": {
    "policy": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schema_version",
        "name",
        "models",
        "providers"
      ],
      "properties": {
        "schema_version": {
          "type": "integer",
          "const": 1
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "models": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "mode"
              ],
              "properties": {
                "mode": {
                  "type": "string",
                  "enum": [
                    "inherit",
                    "allow_all",
                    "deny_all"
                  ]
                }
              }
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "mode",
                "values"
              ],
              "properties": {
                "mode": {
                  "type": "string",
                  "const": "allow_list"
                },
                "values": {
                  "type": "array",
                  "maxItems": 1000,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 200
                  }
                }
              }
            }
          ],
          "description": "Empty allowlists deny. Values must be exact, nonblank, trimmed identifiers without controls or wildcard; use allow_all explicitly."
        },
        "providers": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "mode"
              ],
              "properties": {
                "mode": {
                  "type": "string",
                  "enum": [
                    "inherit",
                    "allow_all",
                    "deny_all"
                  ]
                }
              }
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "mode",
                "values"
              ],
              "properties": {
                "mode": {
                  "type": "string",
                  "const": "allow_list"
                },
                "values": {
                  "type": "array",
                  "maxItems": 1000,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 200
                  }
                }
              }
            }
          ],
          "description": "Empty allowlists deny. Values must be exact, nonblank, trimmed identifiers without controls or wildcard; use allow_all explicitly."
        },
        "input_detectors": {
          "type": "array",
          "maxItems": 4,
          "description": "Required input detectors. Composes workspace and assigned-key restrictions. Only deployment-authorized workspaces and declared unmetered services can activate a current configuration fingerprint. Matched or indeterminate results fail closed before inference admission. Textual content only, after local redaction; unsupported content is denied. Paid and unknown-cost detectors remain synthetic-only.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "detector",
              "configuration_fingerprint",
              "consent_to_external_processing"
            ],
            "properties": {
              "detector": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200,
                "pattern": "^[a-zA-Z0-9_-]+$"
              },
              "configuration_fingerprint": {
                "type": "string",
                "pattern": "^[a-f0-9]{64}$"
              },
              "consent_to_external_processing": {
                "type": "boolean",
                "const": true
              }
            }
          }
        },
        "input_rules": {
          "type": "array",
          "maxItems": 32,
          "description": "Local text rules enforced before dispatch. Workspace and assigned-key rules compose; unsupported content fails closed. At most 32 combined rules are supported.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "action"
            ],
            "oneOf": [
              {
                "required": [
                  "pattern"
                ]
              },
              {
                "required": [
                  "preset"
                ]
              }
            ],
            "properties": {
              "pattern": {
                "type": "string",
                "maxLength": 4096
              },
              "preset": {
                "enum": [
                  "email_v1",
                  "api_key_prefix_v1"
                ]
              },
              "action": {
                "enum": [
                  "block",
                  "redact"
                ]
              }
            }
          }
        },
        "output": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "mode",
            "rules"
          ],
          "description": "Complete textual output inspection bounded to 1 MiB. Streaming, tools, structured-output requests and Embeddings are incompatible and rejected before inference in both modes. Buffered enforcement withholds indeterminate output; observation records matches or indeterminate coverage without redaction or denial. Observation sees the original response and cannot weaken inherited enforcement. Incurred usage remains chargeable. External output detectors and streaming inspection are not implemented.",
          "properties": {
            "mode": {
              "enum": [
                "buffered_full",
                "observe_only"
              ]
            },
            "rules": {
              "type": "array",
              "minItems": 1,
              "maxItems": 32,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "action"
                ],
                "oneOf": [
                  {
                    "required": [
                      "pattern"
                    ]
                  },
                  {
                    "required": [
                      "preset"
                    ]
                  }
                ],
                "properties": {
                  "pattern": {
                    "type": "string",
                    "maxLength": 4096
                  },
                  "preset": {
                    "enum": [
                      "email_v1",
                      "api_key_prefix_v1"
                    ]
                  },
                  "action": {
                    "enum": [
                      "block",
                      "redact"
                    ]
                  }
                }
              }
            }
          }
        }
      }
    },
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "provider": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

## Responses

### HTTP 200

Access-only preview verdict.

### HTTP 400

Invalid policy or candidate.

### HTTP 401

Authentication required.

### HTTP 403

Workspace read access required.

## Behavior and supported scope

Returns allowed, coverage=model_provider_access and route_availability_checked=false. Does not check route availability, content, retention, budgets or credential grants.

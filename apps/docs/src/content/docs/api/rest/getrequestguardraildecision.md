---
title: "Read immutable policy attribution for an allowed dispatch"
description: "GET /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/guardrails"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/guardrails`

Requires workspace read access. Returns data null for attempts without recorded attribution, including historical attempts and denied transitions. Does not reconstruct denial records or claim content inspection. Policy names and revisions are historical; current policy changes do not rewrite them. Responses use Cache-Control no-store and exclude content, credentials, internal identifiers and commercial data.

Operation: `getRequestGuardrailDecision`.

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

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path placeholders with the references required by this operation. Use the credential scope described above.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/guardrails" \
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

### attempt

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

Scoped attribution or null.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "stage",
            "outcome",
            "coverage",
            "enforcer_version",
            "workspace_revision",
            "workspace_policy_name",
            "key_policy_revision",
            "key_policy_name",
            "key_assignment_revision",
            "recorded_at",
            "input_inspection",
            "output_inspection",
            "output_observation"
          ],
          "properties": {
            "stage": {
              "const": "dispatch"
            },
            "outcome": {
              "const": "allowed"
            },
            "coverage": {
              "const": "model_provider_access"
            },
            "enforcer_version": {
              "const": "access-v1"
            },
            "workspace_revision": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 1
            },
            "workspace_policy_name": {
              "type": [
                "string",
                "null"
              ]
            },
            "key_policy_revision": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 1
            },
            "key_policy_name": {
              "type": [
                "string",
                "null"
              ]
            },
            "key_assignment_revision": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 1
            },
            "recorded_at": {
              "type": "string",
              "format": "date-time"
            },
            "output_inspection": {
              "description": "Null means no complete-output decision was recorded. Blocking does not cancel incurred customer charges or Provider usage. No original output is returned in decision metadata.",
              "oneOf": [
                {
                  "type": "null"
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "outcome",
                    "reason",
                    "mode",
                    "coverage",
                    "enforcer_version",
                    "elapsed_ms"
                  ],
                  "properties": {
                    "outcome": {
                      "enum": [
                        "allowed",
                        "redacted",
                        "blocked",
                        "indeterminate"
                      ]
                    },
                    "reason": {
                      "enum": [
                        "inspected_text",
                        "pattern_denial",
                        "unsupported_content",
                        "resource_limit",
                        "inspection_unavailable"
                      ]
                    },
                    "mode": {
                      "const": "buffered_full"
                    },
                    "coverage": {
                      "const": "local_text"
                    },
                    "enforcer_version": {
                      "const": "local-output-v1"
                    },
                    "elapsed_ms": {
                      "type": "integer",
                      "minimum": 0
                    }
                  }
                }
              ]
            },
            "output_observation": {
              "description": "Non-enforcing inspection of the original complete response. A match does not mean output was withheld. Null means no observation was recorded; no original or matched content is returned.",
              "oneOf": [
                {
                  "type": "null"
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "outcome",
                    "reason",
                    "mode",
                    "enforcement",
                    "coverage",
                    "enforcer_version",
                    "elapsed_ms"
                  ],
                  "properties": {
                    "outcome": {
                      "enum": [
                        "clear",
                        "matched",
                        "indeterminate"
                      ]
                    },
                    "reason": {
                      "enum": [
                        "inspected_text",
                        "pattern_match",
                        "unsupported_content",
                        "resource_limit",
                        "inspection_unavailable"
                      ]
                    },
                    "mode": {
                      "const": "observe_only"
                    },
                    "enforcement": {
                      "const": false
                    },
                    "coverage": {
                      "const": "local_text"
                    },
                    "enforcer_version": {
                      "const": "local-output-v1"
                    },
                    "elapsed_ms": {
                      "type": "integer",
                      "minimum": 0
                    }
                  }
                }
              ]
            },
            "input_inspection": {
              "description": "Null means no recorded local inspection result; never infer historical content protection. Duration includes local compilation and worker execution, not upstream generation.",
              "oneOf": [
                {
                  "type": "null"
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "outcome",
                    "coverage",
                    "enforcer_version",
                    "elapsed_ms"
                  ],
                  "properties": {
                    "outcome": {
                      "enum": [
                        "allowed",
                        "redacted"
                      ]
                    },
                    "coverage": {
                      "const": "local_text"
                    },
                    "enforcer_version": {
                      "const": "local-input-v1"
                    },
                    "elapsed_ms": {
                      "type": "integer",
                      "minimum": 0
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    }
  }
}
```

### HTTP 401

Authentication required.

### HTTP 403

Workspace read access required.

## Behavior and supported scope

Requires workspace read access. Returns data null for attempts without recorded attribution, including historical attempts and denied transitions. Does not reconstruct denial records or claim content inspection. Policy names and revisions are historical; current policy changes do not rewrite them. Responses use Cache-Control no-store and exclude content, credentials, internal identifiers and commercial data.

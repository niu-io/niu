---
title: "Read public instance configuration, branding, currency, and sign-in capabilities"
description: "GET /api/v1/public/config"
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/public/config`

Public safe projection combining authentication capabilities, initial setup state, registration mode, branding defaults, and configured platform currency in a single request. No credentials, actors, or commercial rates are exposed.

Operation: `getPublicConfig`.

## Authentication

No OpenAPI security scheme is required. Other request validation still applies.

```json
[]
```

## HTTP request

Set `NIU_ORIGIN` to your installation origin (without `/v1`). Replace path, query and header placeholders with the required values. Query examples use curl 7.87 or newer to encode values with `--url-query`. Use the credential scope described above; a bearer token must have the authority required by this operation.

```sh
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/public/config"
```

## Parameters

No path, query, or header parameters are declared.

## Request body

No request body is declared.

## Responses

### HTTP 200

Public instance configuration in data.

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "required": [
        "password_login",
        "browser_token_login",
        "demo_login",
        "setup_required",
        "registration_mode",
        "branding",
        "currency",
        "billing_mode",
        "unit"
      ],
      "properties": {
        "password_login": {
          "type": "boolean"
        },
        "browser_token_login": {
          "type": "boolean"
        },
        "demo_login": {
          "type": "boolean"
        },
        "setup_required": {
          "type": "boolean"
        },
        "registration_mode": {
          "type": "string",
          "enum": [
            "disabled",
            "approval_required"
          ]
        },
        "branding": {
          "type": "object",
          "required": [
            "revision",
            "settings"
          ],
          "properties": {
            "revision": {
              "type": "string"
            },
            "settings": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "display_name",
                "default_appearance",
                "light",
                "dark"
              ],
              "properties": {
                "display_name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 80,
                  "description": "Trimmed nonempty text without control characters"
                },
                "default_appearance": {
                  "type": "string",
                  "enum": [
                    "system",
                    "light",
                    "dark"
                  ]
                },
                "logo_data_url": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 349550,
                  "pattern": "^data:image/png;base64,[A-Za-z0-9+/=]+$",
                  "description": "Static PNG up to 256 KiB, at most 1024 by 512 pixels. Re-encoded from decoded pixels before saving. Missing or null resets to default."
                },
                "favicon_data_url": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 43714,
                  "pattern": "^data:image/png;base64,[A-Za-z0-9+/=]+$",
                  "description": "Square static PNG up to 32 KiB, at most 256 by 256 pixels. Missing or null resets to default."
                },
                "light": {
                  "type": "object",
                  "maxProperties": 8,
                  "propertyNames": {
                    "enum": [
                      "background",
                      "foreground",
                      "primary",
                      "primary-foreground",
                      "sidebar",
                      "sidebar-foreground",
                      "accent",
                      "accent-foreground"
                    ]
                  },
                  "additionalProperties": {
                    "type": "string",
                    "pattern": "^#[0-9a-fA-F]{6}$"
                  }
                },
                "dark": {
                  "type": "object",
                  "maxProperties": 8,
                  "propertyNames": {
                    "enum": [
                      "background",
                      "foreground",
                      "primary",
                      "primary-foreground",
                      "sidebar",
                      "sidebar-foreground",
                      "accent",
                      "accent-foreground"
                    ]
                  },
                  "additionalProperties": {
                    "type": "string",
                    "pattern": "^#[0-9a-fA-F]{6}$"
                  }
                }
              }
            }
          }
        },
        "currency": {
          "type": [
            "string",
            "null"
          ]
        },
        "billing_mode": {
          "type": "string"
        },
        "unit": {
          "type": [
            "object",
            "null"
          ]
        }
      }
    }
  }
}
```

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Public safe projection combining authentication capabilities, initial setup state, registration mode, branding defaults, and configured platform currency in a single request. No credentials, actors, or commercial rates are exposed.

**Supported scope:** implemented

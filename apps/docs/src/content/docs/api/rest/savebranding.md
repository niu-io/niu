---
title: "Save platform branding and theme configuration"
description: "PUT /admin/v1/platform/branding"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`PUT /admin/v1/platform/branding`

Installation credentials or an explicit platform-administrator grant required; company owner/admin role alone does not grant platform administration. Returns the same public-safe branding/theme shape. Canonical nonnegative decimal expected_revision string controls atomic snapshot and audit save. Valid display name is nonempty, already trimmed and at most 80 Unicode characters without controls. Palette maps only accept eight supported tokens with six-digit hex colors and readable contrast; empty maps inherit Niu defaults. No arbitrary CSS or executable branding is accepted. Optional null/omitted images reset to defaults. PNG images are decoded and re-encoded before persistence. Route JSON body limit is 450000 bytes. Successful save returns the exact committed snapshot and incremented string revision.

Operation: `saveBranding`.

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
curl --fail-with-body -X PUT "$NIU_ORIGIN/admin/v1/platform/branding" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN" \
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
    "expected_revision",
    "settings"
  ],
  "properties": {
    "expected_revision": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)$"
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
}
```

## Responses

### HTTP 200

Branding revision and settings in data.

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
        "revision",
        "settings"
      ],
      "properties": {
        "revision": {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
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
    }
  }
}
```

### HTTP 400

Invalid revision, name, palette, contrast or image.

### HTTP 401

Authentication required.

### HTTP 403

Platform administration required.

### HTTP 409

Stale revision, exhausted revision or image normalization capacity exceeded; no accepted overwrite.

### HTTP 413

JSON body exceeds route size limit.

### HTTP 415

JSON content type required.

### HTTP 422

Invalid JSON body shape.

### HTTP 503

Durable storage unavailable.

## Behavior and supported scope

Installation credentials or an explicit platform-administrator grant required; company owner/admin role alone does not grant platform administration. Returns the same public-safe branding/theme shape. Canonical nonnegative decimal expected_revision string controls atomic snapshot and audit save. Valid display name is nonempty, already trimmed and at most 80 Unicode characters without controls. Palette maps only accept eight supported tokens with six-digit hex colors and readable contrast; empty maps inherit Niu defaults. No arbitrary CSS or executable branding is accepted. Optional null/omitted images reset to defaults. PNG images are decoded and re-encoded before persistence. Route JSON body limit is 450000 bytes. Successful save returns the exact committed snapshot and incremented string revision.

**Supported scope:** implemented

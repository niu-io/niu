---
title: "Compare customer charge records with prepaid ledger debits"
description: "GET /api/v1/organizations/{organization}/billing/charge-reconciliation"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /api/v1/organizations/{organization}/billing/charge-reconciliation`

Organization-wide owner/admin or installation read access required. One database snapshot compares prepaid-bound text and media charges against original charge entries per currency. Refunds do not reduce original charge matching. Reports counts and exact decimal amounts only, with no internal identifiers or Provider prices. Zero counts on an empty account do not establish financial readiness. This is read-only and does not verify external payment settlement, recalculate prices, reconcile legacy invoices or repair discrepancies. Pending settlement can appear as a discrepancy; use a later observation to distinguish an in-flight write from a persistent mismatch.

Operation: `getCustomerChargeReconciliation`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/api/v1/organizations/{organization}/billing/charge-reconciliation" \
  -H "Authorization: Bearer $NIU_SESSION_TOKEN"
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

Per-currency observations

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "currency",
          "observed_at",
          "charge_records",
          "completed_unaccrued_attempts",
          "expected_charge_nanos",
          "posted_charge_nanos",
          "missing_charge_entries",
          "mismatched_charge_entries",
          "unexpected_charge_entries",
          "duplicate_charge_sources",
          "settled_open_reservations"
        ],
        "properties": {
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "observed_at": {
            "type": "string",
            "format": "date-time"
          },
          "charge_records": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "completed_unaccrued_attempts": {
            "type": "string",
            "pattern": "^[0-9]+$",
            "description": "Completed prepaid-bound attempts without a text or media charge record. May await usage or financial recovery; not an amount, corruption finding or authorization to retry inference."
          },
          "expected_charge_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "posted_charge_nanos": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "missing_charge_entries": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "mismatched_charge_entries": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "unexpected_charge_entries": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "duplicate_charge_sources": {
            "type": "string",
            "pattern": "^[0-9]+$"
          },
          "settled_open_reservations": {
            "type": "string",
            "pattern": "^[0-9]+$"
          }
        }
      }
    }
  }
}
```

### HTTP 401

Missing or invalid administration credentials

### HTTP 404

Company billing scope unavailable to this principal

### HTTP 503

Storage unavailable

## Behavior and supported scope

Organization-wide owner/admin or installation read access required. One database snapshot compares prepaid-bound text and media charges against original charge entries per currency. Refunds do not reduce original charge matching. Reports counts and exact decimal amounts only, with no internal identifiers or Provider prices. Zero counts on an empty account do not establish financial readiness. This is read-only and does not verify external payment settlement, recalculate prices, reconcile legacy invoices or repair discrepancies. Pending settlement can appear as a discrepancy; use a later observation to distinguish an in-flight write from a persistent mismatch.

**Supported scope:** implemented

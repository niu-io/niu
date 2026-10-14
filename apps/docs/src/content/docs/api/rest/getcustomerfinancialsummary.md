---
title: "Read platform customer revenue and cash receipt summary"
description: "GET /admin/v1/financial-summary"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

`GET /admin/v1/financial-summary`

Explicit platform administrator only; no customer or Provider access. One database snapshot, configured currency and UTC rolling posting interval [from, until), 7/30/90 days. Confirmed text/media charges use their immutable charge posting time; customer refunds, grants and cash receipts use their own posting times. This differs from the commercial dispatch cohort. Personal-funded operations, durable personal attempt bindings and current personal-owned Provider offer credentials are excluded from consumption and related refunds. Revenue is nominal consumption minus consumed gift allowance and non-gift refunds; explicit late-grant applications post sales allowance at application time, while their refund restoration is already part of refund gift allocation and is not posted twice; non-gift can be prepaid or credit-backed. Issuing a gift or collecting a credit repayment never creates consumption revenue. Missing or legacy-unknown consumption allocation leaves revenue and total allowance null; known subtotals are partial. Uncovered nominal includes both charge and refund amounts as positive coverage exposure. A zero-charge record is known zero. Net allowance/revenue may be negative when refunds relate to an earlier interval. Verified cash receipt records remain independent; potentially overlapping legacy invoice and funding references leave the combined receipt total null. Funding reversal records do not attest an external cash refund transfer. No procurement prices, customer identifiers, credentials or content. The balance_credit_sources object is a point-in-time company wallet cash/credit provenance view at as_of, independent of the selected posting interval and external invoice receivables. Verified cash repayments reduce outstanding credit without creating revenue. Missing historical sources, unclassified adjustments or funding reversal ambiguity withhold complete prepaid cash and outstanding credit; known subtotals include only wholly covered accounts. Aggregate read only; does not initiate merchant operations. Cache-Control: no-store. This operational reconciliation report is not a closed general ledger or tax statement.

Operation: `getCustomerFinancialSummary`.

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
curl --fail-with-body -X GET "$NIU_ORIGIN/admin/v1/financial-summary" \
  -H "Authorization: Bearer $NIU_ADMIN_TOKEN"
```

## Parameters

### currency

Location: **query**. **Required.**

```json
{
  "type": "string",
  "pattern": "^[A-Z]{3}$"
}
```

### days

Location: **query**. Optional.

```json
{
  "type": "integer",
  "enum": [
    7,
    30,
    90
  ],
  "default": 30
}
```

## Request body

No request body is declared.

## Responses

### HTTP 200

Current posting summary, unknown totals explicitly null

Content type: `application/json`.

```json
{
  "type": "object",
  "required": [
    "currency",
    "days",
    "from",
    "until",
    "nominal_consumption_nanos",
    "customer_refunds_nanos",
    "known_revenue_subtotal_nanos",
    "known_gift_allowance_subtotal_nanos",
    "uncovered_entries",
    "uncovered_nominal_nanos",
    "balance_funding_receipts_nanos",
    "external_invoice_receipts_nanos",
    "cash_receipt_reference_conflicts",
    "recorded_funding_reversals_nanos",
    "issued_gifts_nanos",
    "recognized_revenue_nanos",
    "consumed_gift_allowance_nanos",
    "balance_credit_sources",
    "verified_cash_receipts_nanos"
  ],
  "properties": {
    "balance_credit_sources": {
      "type": "object",
      "required": [
        "as_of",
        "uncovered_accounts",
        "prepaid_cash_nanos",
        "outstanding_credit_nanos",
        "known_prepaid_cash_subtotal_nanos",
        "known_outstanding_credit_subtotal_nanos"
      ],
      "properties": {
        "as_of": {
          "type": "string",
          "format": "date-time"
        },
        "uncovered_accounts": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "prepaid_cash_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "outstanding_credit_nanos": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^[0-9]+$"
        },
        "known_prepaid_cash_subtotal_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        "known_outstanding_credit_subtotal_nanos": {
          "type": "string",
          "pattern": "^[0-9]+$"
        }
      }
    },
    "currency": {
      "type": "string"
    },
    "days": {
      "type": "integer",
      "enum": [
        7,
        30,
        90
      ]
    },
    "from": {
      "type": "string",
      "format": "date-time"
    },
    "until": {
      "type": "string",
      "format": "date-time"
    },
    "nominal_consumption_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "customer_refunds_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "known_revenue_subtotal_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "known_gift_allowance_subtotal_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "uncovered_entries": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "uncovered_nominal_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "balance_funding_receipts_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "external_invoice_receipts_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "cash_receipt_reference_conflicts": {
      "type": "string",
      "pattern": "^-?[0-9]+$"
    },
    "recorded_funding_reversals_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$",
      "description": "Ledger reversals of verified funding; not proof of an external refund transfer."
    },
    "issued_gifts_nanos": {
      "type": "string",
      "pattern": "^-?[0-9]+$",
      "description": "Noncash grants issued in this interval. No income or promotional expense is recognized by issuance."
    },
    "recognized_revenue_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^-?[0-9]+$",
      "description": "Confirmed consumption less consumed gifts and non-gift refunds. Null if any source allocation is missing or unknown."
    },
    "consumed_gift_allowance_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^-?[0-9]+$"
    },
    "verified_cash_receipts_nanos": {
      "type": [
        "string",
        "null"
      ],
      "pattern": "^-?[0-9]+$",
      "description": "Verified balance funding plus recorded full external invoice payments. Null for ambiguous duplicate references. Separate from consumption and revenue."
    }
  }
}
```

### HTTP 400

Invalid period or unknown currency

### HTTP 401

Authentication required

### HTTP 403

Explicit platform administration required

## Behavior and supported scope

Explicit platform administrator only; no customer or Provider access. One database snapshot, configured currency and UTC rolling posting interval [from, until), 7/30/90 days. Confirmed text/media charges use their immutable charge posting time; customer refunds, grants and cash receipts use their own posting times. This differs from the commercial dispatch cohort. Personal-funded operations, durable personal attempt bindings and current personal-owned Provider offer credentials are excluded from consumption and related refunds. Revenue is nominal consumption minus consumed gift allowance and non-gift refunds; explicit late-grant applications post sales allowance at application time, while their refund restoration is already part of refund gift allocation and is not posted twice; non-gift can be prepaid or credit-backed. Issuing a gift or collecting a credit repayment never creates consumption revenue. Missing or legacy-unknown consumption allocation leaves revenue and total allowance null; known subtotals are partial. Uncovered nominal includes both charge and refund amounts as positive coverage exposure. A zero-charge record is known zero. Net allowance/revenue may be negative when refunds relate to an earlier interval. Verified cash receipt records remain independent; potentially overlapping legacy invoice and funding references leave the combined receipt total null. Funding reversal records do not attest an external cash refund transfer. No procurement prices, customer identifiers, credentials or content. The balance_credit_sources object is a point-in-time company wallet cash/credit provenance view at as_of, independent of the selected posting interval and external invoice receivables. Verified cash repayments reduce outstanding credit without creating revenue. Missing historical sources, unclassified adjustments or funding reversal ambiguity withhold complete prepaid cash and outstanding credit; known subtotals include only wholly covered accounts. Aggregate read only; does not initiate merchant operations. Cache-Control: no-store. This operational reconciliation report is not a closed general ledger or tax statement.

**Supported scope:** implemented

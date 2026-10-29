---
title: "CustomerFinancialSummary"
description: "Generated TypeScript declaration for CustomerFinancialSummary"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Posting interval; nullable totals are unavailable, and known subtotals are partial. */
export type CustomerFinancialSummary = {
    currency: string;
    days: number;
    from: string;
    until: string;
    nominal_consumption_nanos: string;
    customer_refunds_nanos: string;
    known_revenue_subtotal_nanos: string;
    known_gift_allowance_subtotal_nanos: string;
    uncovered_entries: string;
    uncovered_nominal_nanos: string;
    balance_funding_receipts_nanos: string;
    /** Simulated checkout receipts; excluded from verified cash. */
    simulated_funding_receipts_nanos: string;
    external_invoice_receipts_nanos: string;
    cash_receipt_reference_conflicts: string;
    recorded_funding_reversals_nanos: string;
    issued_gifts_nanos: string;
    corrected_unused_gifts_nanos: string;
    recognized_revenue_nanos: string | null;
    consumed_gift_allowance_nanos: string | null;
    verified_cash_receipts_nanos: string | null;
    /** Current wallet provenance at as_of, distinct from posting-period revenue. */
    balance_credit_sources: {
        as_of: string;
        uncovered_accounts: string;
        /** Wallets whose historical allocation mixes simulated and real funding. */
        simulated_funding_accounts: string;
        prepaid_cash_nanos: string | null;
        outstanding_credit_nanos: string | null;
        known_prepaid_cash_subtotal_nanos: string;
        known_outstanding_credit_subtotal_nanos: string;
    };
};
```

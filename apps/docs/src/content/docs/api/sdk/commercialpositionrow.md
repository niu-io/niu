---
title: "CommercialPositionRow"
description: "Generated TypeScript declaration for CommercialPositionRow"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Confidential platform comparison. Customer charge is not an external cash receipt. */
export type CommercialPositionRow = {
    supplier_id: string;
    supplier_name: string;
    model_alias: string;
    currency: string;
    offers: Array<{
        offer_id: string;
        route_alias: string;
        revision: string;
        rate_kind: 'text' | 'media';
        prompt_rate: string | null;
        completion_rate: string | null;
        state: 'paused' | 'unqualified' | 'qualified';
        media_rates: Array<Pick<SupplierMediaRateRecord['card'], 'revision' | 'tariff' | 'discounts'>>;
    }>;
    customer_charge_nanos: string | null;
    earning_nanos: string | null;
    settled_earning_nanos: string | null;
    unsettled_earning_nanos: string | null;
    cost_nanos: string | null;
    margin_nanos: string | null;
    unresolved_attempts: string;
    matched_attempts: string;
    cost_known_attempts: string;
};
```

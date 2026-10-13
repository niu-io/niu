---
title: "CustomerMediaRateCard"
description: "Generated TypeScript declaration for CustomerMediaRateCard"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Customer selling configuration; Supplier purchase prices do not belong here. */
export type CustomerMediaRateCard = {
    revision: string;
    vendor_id: string;
    vendor_revision: number;
    model_revision: number;
    schema_revision: string;
    offer_revision: string;
    tariff: {
        revision: string;
        dimensions: MediaBillingDimensions;
        meter: string;
        currency: string;
        decimal_places: number;
        amount_units: number;
        per_quantity: ExactMediaQuantity;
        minimum_quantity: ExactMediaQuantity;
        rounding: 'Down' | 'Up' | 'HalfEven';
        effective_from: number;
        effective_until: number | null;
    };
    discounts: Array<{
        revision: string;
        dimensions: MediaBillingDimensions | null;
        offer: string | null;
        customer: string | null;
        effective_from: number;
        effective_until: number | null;
        priority: number;
        stacking: 'Exclusive' | 'Multiply';
        multiplier: ExactMediaQuantity;
    }>;
    maximum_quantity: ExactMediaQuantity;
    liability_qualification_revision: string;
};
```

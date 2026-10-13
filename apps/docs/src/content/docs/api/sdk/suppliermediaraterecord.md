---
title: "SupplierMediaRateRecord"
description: "Generated TypeScript declaration for SupplierMediaRateRecord"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type SupplierMediaRateRecord = {
    card: Omit<SupplierMediaRateCard, 'vendor_revision' | 'model_revision' | 'tariff' | 'discounts'> & {
        vendor_revision: string;
        model_revision: string;
        tariff: Omit<SupplierMediaRateCard['tariff'], 'amount_units' | 'effective_from' | 'effective_until'> & {
            amount_units: string;
            effective_from: string;
            effective_until: string | null;
        };
        discounts: Array<Omit<SupplierMediaRateCard['discounts'][number], 'effective_from' | 'effective_until'> & {
            effective_from: string;
            effective_until: string | null;
        }>;
    };
    retirement_effective_until: string | null;
    created_at: string | null;
};
```

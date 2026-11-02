---
title: "ProviderCostEstimate"
description: "Generated TypeScript declaration for ProviderCostEstimate"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderCostEstimate = {
    basis: 'advertised_quote_estimate';
    status: 'available' | 'partial' | 'unavailable';
    totals: Array<{
        currency: string;
        amount: string;
    }>;
    unknown_meters: string[];
    unsupported_price_dimensions: string[];
    complete_for_supplied_meters: boolean;
    is_actual_provider_charge: false;
};
```

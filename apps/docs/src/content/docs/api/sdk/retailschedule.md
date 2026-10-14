---
title: "RetailSchedule"
description: "Generated TypeScript declaration for RetailSchedule"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Explicit customer selling terms; amounts and quantities remain decimal strings. */
export type RetailSchedule = {
    kind: 'text';
    prompt_rate: string;
    completion_rate: string;
    cached_prompt_rate: string | null;
    cache_write_prompt_rate: string | null;
    reasoning_completion_rate: string | null;
    minimum_charge_nanos: string;
    request_fee_nanos: string;
    context_tiers: ContextPriceTier[];
} | {
    kind: 'media';
    dimensions: MediaBillingDimensions;
    meter: string;
    decimal_places: number;
    amount_units: string;
    per_quantity: ExactMediaQuantity;
    minimum_quantity: ExactMediaQuantity;
    rounding: 'Down' | 'Up' | 'HalfEven';
};
```

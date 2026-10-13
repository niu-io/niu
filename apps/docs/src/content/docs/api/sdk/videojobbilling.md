---
title: "VideoJobBilling"
description: "Generated TypeScript declaration for VideoJobBilling"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoJobBilling = {
    mode: 'owner_funded' | 'customer' | 'unavailable';
    state: 'owner_funded' | 'unavailable' | 'reserved' | 'awaiting_usage' | 'awaiting_settlement' | 'settled' | 'reconciliation_required';
    currency: string | null;
    reserved_nanos: string | null;
    charge_nanos: string | null;
    usage: {
        meter: string;
        quantity: {
            numerator: string;
            denominator: string;
        };
    } | null;
    settled_usage?: {
        meter: string;
        quantity: {
            numerator: string;
            denominator: string;
        };
        billable_quantity: {
            numerator: string;
            denominator: string;
        };
        provenance: 'Reported';
    } | null;
    bound_exceeded: boolean | null;
    effective_output: VideoEffectiveOutput | null;
    estimate: {
        meter: string;
        quantity: {
            numerator: string;
            denominator: string;
        };
        provenance: 'Estimate';
        currency: string | null;
        amount_nanos: string | null;
    } | null;
    price: {
        meter: string;
        amount_units: string;
        decimal_places: number;
        per_quantity: {
            numerator: string;
            denominator: string;
        };
        minimum_quantity: {
            numerator: string;
            denominator: string;
        };
        rounding: 'Down' | 'Up' | 'HalfEven';
        resolution: string;
        reference_video: boolean;
        effective_from: string;
        effective_until: string | null;
        discounts: Array<{
            multiplier: {
                numerator: string;
                denominator: string;
            };
            stacking: 'Exclusive' | 'Multiply';
            effective_from: string;
            effective_until: string | null;
        }>;
    } | null;
};
```

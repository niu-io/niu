---
title: "ProviderPriceEvidence"
description: "Generated TypeScript declaration for ProviderPriceEvidence"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderPriceEvidence = {
    normalization_version: number;
    source_digest: string | null;
    conditions: Array<{
        id: string;
        description: string;
    }>;
    observed_at_ms: number | null;
    status: 'available' | 'partial' | 'unavailable';
    source: string;
    basis: 'advertised' | 'native_ratios_not_money';
    reason: string | null;
    prices: Array<{
        model: string;
        source_rules: unknown | null;
        rates: Array<{
            meter: string;
            amount: string;
            currency: string;
            per_units: number;
            unit: string;
            condition: string | null;
        }>;
        unsupported_dimensions: string[];
    }>;
    group_multipliers: Record<string, string>;
    native_ratios: Array<{
        model: string;
        eligible_groups: string[];
        input_ratio: string | null;
        output_ratio: string | null;
        cached_input_ratio: string | null;
        request_price: string | null;
        quota_type: number | null;
    }>;
};
```

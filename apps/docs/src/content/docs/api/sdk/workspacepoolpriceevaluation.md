---
title: "WorkspacePoolPriceEvaluation"
description: "Generated TypeScript declaration for WorkspacePoolPriceEvaluation"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspacePoolPriceEvaluation = {
    source: 'customer_selling_price';
    billing_mode: string;
    currency: string;
    unit: 'nanounits_per_million_tokens';
    input_tokens: number;
    output_tokens: number;
    basis: 'customer_price' | 'priority_weight_fallback';
    fallback_reason: string | null;
    selected_candidate: string | null;
    candidates: Array<{
        alias: string;
        estimated_customer_charge_nanos: string | null;
        price_unknown_reason: string | null;
    }>;
};
```

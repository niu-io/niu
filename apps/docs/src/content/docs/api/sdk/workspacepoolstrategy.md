---
title: "WorkspacePoolStrategy"
description: "Generated TypeScript declaration for WorkspacePoolStrategy"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Versioned selection strategy for a customer-owned model policy. */
export type WorkspacePoolStrategy = {
    version: 1 | 2;
    mode: 'priority_weight' | 'customer_price' | 'auto';
    /**
     * Required exactly for `customer_price`. Ranks eligible candidates by the
     * estimated customer selling price in this currency and unit. Missing or
     * incomparable prices remain unknown; selection then falls back to priority
     * and weight. Provider procurement prices are never used.
     */
    customer_price?: {
        currency: string;
        unit: 'nanounits_per_million_tokens';
        input_tokens: number;
        output_tokens: number;
    };
    /**
     * Required exactly for version 2 `auto`. Caller task/stage context is
     * evaluated first; the optional decider may only select a declared,
     * response-compatible path. Unknown or incompatible decisions are failures,
     * never silent substitutions.
     */
    auto?: {
        paths: WorkspaceAutoPath[];
        decider?: WorkspaceAutoDecider;
    };
};
```

---
title: "Model"
description: "Generated TypeScript declaration for Model"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type Model = {
    id: string;
    object: 'model' | string;
    owned_by?: string;
    customer_pricing?: {
        pricing_source?: 'workspace' | 'platform';
        promotion_scope?: 'global' | 'customer' | null;
        selected_at?: string;
        price_version?: string;
        currency: string;
        unit: 'nanounits_per_million_tokens';
        context_tiers?: ContextPriceTier[];
        prompt_rate: string;
        completion_rate: string;
        cached_prompt_rate?: string | null;
        reasoning_completion_rate?: string | null;
        cache_write_prompt_rate?: string | null;
        minimum_charge_nanos?: string;
        request_fee_nanos?: string;
    } | null;
};
```

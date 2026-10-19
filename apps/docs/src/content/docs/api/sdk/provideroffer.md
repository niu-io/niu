---
title: "ProviderOffer"
description: "Generated TypeScript declaration for ProviderOffer"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderOffer = {
    context_tiers?: ContextPriceTier[];
    id: string;
    model_alias: string;
    revision: string;
    active: boolean;
    qualified: boolean;
    route_ready: boolean;
    cached_prompt_rate?: string | null;
    reasoning_completion_rate?: string | null;
    cache_write_prompt_rate?: string | null;
} & ({
    rate_kind?: 'text';
    currency: string;
    prompt_rate: string;
    completion_rate: string;
} | {
    rate_kind: 'media';
    currency: null;
    prompt_rate: null;
    completion_rate: null;
});
```

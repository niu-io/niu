---
title: "ProviderOfferRevision"
description: "Generated TypeScript declaration for ProviderOfferRevision"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Immutable procurement quote; media prices are in the separate media rate card. */
export type ProviderOfferRevision = {
    revision: string;
    model_alias: string;
    created_at: string;
} & ({
    rate_kind: 'text';
    currency: string;
    prompt_rate: string;
    completion_rate: string;
    cached_prompt_rate: string | null;
    reasoning_completion_rate: string | null;
    cache_write_prompt_rate: string | null;
    context_tiers: ContextPriceTier[];
} | {
    rate_kind: 'media';
    currency: null;
    prompt_rate: null;
    completion_rate: null;
    cached_prompt_rate: null;
    reasoning_completion_rate: null;
    cache_write_prompt_rate: null;
});
```

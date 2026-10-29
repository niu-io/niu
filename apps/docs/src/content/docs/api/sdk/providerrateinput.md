---
title: "ProviderRateInput"
description: "Generated TypeScript declaration for ProviderRateInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Agreed Provider rates in currency nanounits per million tokens. */
export type ProviderRateInput = {
    context_tiers?: ContextPriceTier[];
    model_alias: string;
    currency: string;
    prompt_rate: string;
    completion_rate: string;
    expected_revision: string | null;
    cached_prompt_rate?: string | null;
    reasoning_completion_rate?: string | null;
    cache_write_prompt_rate?: string | null;
};
```

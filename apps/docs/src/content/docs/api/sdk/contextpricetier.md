---
title: "ContextPriceTier"
description: "Generated TypeScript declaration for ContextPriceTier"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Customer selling rates, independent from Provider procurement prices. */
export type ContextPriceTier = {
    minimum_input_tokens: string;
    prompt_rate: string;
    completion_rate: string;
    cached_prompt_rate?: string | null;
    cache_write_prompt_rate?: string | null;
    reasoning_completion_rate?: string | null;
};
```

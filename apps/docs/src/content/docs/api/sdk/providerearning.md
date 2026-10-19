---
title: "ProviderEarning"
description: "Generated TypeScript declaration for ProviderEarning"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Immutable Provider earning attribution; null quantities remain unknown or unpriced. */
export type ProviderEarning = {
    revision: string;
    offer_id: string;
    context_minimum_input_tokens: string | null;
    prompt_tokens: string | null;
    completion_tokens: string | null;
    cached_prompt_tokens: string | null;
    cache_write_prompt_tokens: string | null;
    reasoning_completion_tokens: string | null;
    id: string;
    model_alias: string;
    currency: string;
    amount_nanos: string;
    billing_meter: string;
    created_at: string;
    status: 'accrued' | 'paid';
};
```

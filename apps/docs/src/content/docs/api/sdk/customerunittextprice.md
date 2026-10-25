---
title: "CustomerUnitTextPrice"
description: "Generated TypeScript declaration for CustomerUnitTextPrice"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Token rates are Credits atoms per million tokens; fixed fees are atoms. */
export type CustomerUnitTextPrice = {
    prompt_rate: string;
    completion_rate: string;
    cached_prompt_rate?: string | null;
    cache_write_prompt_rate?: string | null;
    reasoning_completion_rate?: string | null;
    request_fee_atoms: string;
    minimum_charge_atoms: string;
    context_tiers: ContextPriceTier[];
};
```

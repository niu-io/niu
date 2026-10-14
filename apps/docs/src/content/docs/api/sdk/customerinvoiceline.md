---
title: "CustomerInvoiceLine"
description: "Generated TypeScript declaration for CustomerInvoiceLine"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerInvoiceLine = {
    discount_baseline_revision?: string | null;
    model_alias: string;
    revision: string;
    currency: string;
    requests: string;
    prompt_tokens: string;
    completion_tokens: string;
    prompt_rate: string;
    completion_rate: string;
    amount_nanos: string;
    cached_prompt_tokens?: string | null;
    cached_prompt_rate?: string | null;
    reasoning_completion_tokens?: string | null;
    reasoning_completion_rate?: string | null;
    cache_write_prompt_tokens?: string | null;
    cache_write_prompt_rate?: string | null;
    context_minimum_input_tokens?: string | null;
    minimum_charge_nanos?: string;
    request_fee_nanos?: string;
};
```

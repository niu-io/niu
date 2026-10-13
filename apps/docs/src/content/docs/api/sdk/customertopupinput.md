---
title: "CustomerTopupInput"
description: "Generated TypeScript declaration for CustomerTopupInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerTopupInput = {
    currency?: string;
    payment_gateway?: 'epay' | 'stripe' | 'zhifux';
    amount_nanos: string;
    payment_method: string;
    idempotency_key: string;
};
```

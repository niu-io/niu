---
title: "CustomerBalanceGrantInput"
description: "Generated TypeScript declaration for CustomerBalanceGrantInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerBalanceGrantInput = {
    amount_nanos: string;
    reason: string;
    idempotency_key: string;
    application_policy?: 'future_only' | 'unpaid_credit_first';
};
```

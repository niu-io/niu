---
title: "CustomerBalanceReversalInput"
description: "Generated TypeScript declaration for CustomerBalanceReversalInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Exact positive nanounits; retain the same identity when replaying an uncertain write. */
export type CustomerBalanceReversalInput = {
    amount_nanos: string;
    idempotency_key: string;
};
```

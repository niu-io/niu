---
title: "CustomerBalanceGiftCorrectionInput"
description: "Generated TypeScript declaration for CustomerBalanceGiftCorrectionInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Full original amount only; correction is neither a cash refund nor revenue adjustment. */
export type CustomerBalanceGiftCorrectionInput = {
    amount_nanos: string;
    reason: string;
    idempotency_key: string;
};
```

---
title: "CustomerBalanceGiftCorrectionInput"
description: "Generated TypeScript declaration for CustomerBalanceGiftCorrectionInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Noncash gift; issuance is neither a receipt nor revenue. */
export type CustomerBalanceGiftCorrectionInput = {
    amount_nanos: string;
    reason: string;
    idempotency_key: string;
};
```

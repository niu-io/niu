---
title: "ProviderSettlement"
description: "Generated TypeScript declaration for ProviderSettlement"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Payment-record metadata only; never contains customer or request identities. */
export type ProviderSettlement = {
    id: string;
    currency: string;
    amount_nanos: string;
    payment_reference: string;
    created_at: string;
};
```

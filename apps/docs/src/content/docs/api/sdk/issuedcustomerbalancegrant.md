---
title: "IssuedCustomerBalanceGrant"
description: "Generated TypeScript declaration for IssuedCustomerBalanceGrant"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type IssuedCustomerBalanceGrant = {
    id: string;
    amount_nanos: string;
    reason: string;
    currency: string;
    created_at: string;
    correction: {
        id: string;
        amount_nanos: string;
        reason: string;
        created_at: string;
        actor_kind: 'installation' | 'operator';
        actor_label: string;
    } | null;
};
```

---
title: "PreparedCustomerBalanceGrant"
description: "Generated TypeScript declaration for PreparedCustomerBalanceGrant"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Durable intent; prepared does not prove an in-flight publication failed. */
export type PreparedCustomerBalanceGrant = {
    id: string;
    idempotency_key: string;
    currency: string;
    amount_nanos: string;
    reason: string;
    application_policy: 'future_only' | 'unpaid_credit_first';
    created_at: string;
    status: 'prepared' | 'issued';
    result: {
        id: string;
        application_policy: 'future_only' | 'unpaid_credit_first';
        applied_to_credit_nanos: string;
        retained_for_future_consumption_nanos: string;
    } | null;
};
```

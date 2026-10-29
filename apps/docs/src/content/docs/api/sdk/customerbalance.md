---
title: "CustomerBalance"
description: "Generated TypeScript declaration for CustomerBalance"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerBalance = {
    currency: string;
    balance_nanos: string;
    reserved_nanos: string;
    available_nanos: string;
    /** Outstanding holds including known unsettled media overruns; absent on older gateways. */
    outstanding_nanos?: string;
    credit_limit_nanos: string;
    warning_threshold_nanos: string | null;
    policy_revision: string;
    low_balance: boolean;
    posted_credit_exhausted: boolean;
};
```

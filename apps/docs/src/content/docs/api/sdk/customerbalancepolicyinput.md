---
title: "CustomerBalancePolicyInput"
description: "Generated TypeScript declaration for CustomerBalancePolicyInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Exact nonnegative nanounits and optimistic revision for installation credit policy. */
export type CustomerBalancePolicyInput = {
    credit_limit_nanos: string;
    warning_threshold_nanos: string | null;
    expected_revision: string;
};
```

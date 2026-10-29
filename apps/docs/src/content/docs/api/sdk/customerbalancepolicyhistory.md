---
title: "CustomerBalancePolicyHistory"
description: "Generated TypeScript declaration for CustomerBalancePolicyHistory"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Customer-safe immutable credit and warning policy history. */
export type CustomerBalancePolicyHistory = {
    current_revision: string;
    next_before: string | null;
    data: Array<{
        revision: string;
        credit_limit_nanos: string;
        warning_threshold_nanos: string | null;
        created_at: string;
        is_current: boolean;
    }>;
};
```

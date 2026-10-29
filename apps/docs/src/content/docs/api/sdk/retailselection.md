---
title: "RetailSelection"
description: "Generated TypeScript declaration for RetailSelection"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Advice only; request admission must select and pin again under its transaction. */
export type RetailSelection = {
    price_id: string;
    model_alias: string;
    currency: string;
    version: string;
    current_standard_revision: string;
    baseline_revision: string;
    promotion_revision: string | null;
    promotion_scope: 'customer' | 'global' | null;
    selected_at: string;
    schedule: RetailSchedule;
};
```

---
title: "SupplierOfferHistory"
description: "Generated TypeScript declaration for SupplierOfferHistory"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Provider procurement history, never customer workspace billing data. */
export type SupplierOfferHistory = {
    current_revision: string | null;
    data: (SupplierOfferRevision & {
        is_current: boolean;
    })[];
    has_more: boolean;
    next_before: string | null;
};
```

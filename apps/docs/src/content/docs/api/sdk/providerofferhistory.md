---
title: "ProviderOfferHistory"
description: "Generated TypeScript declaration for ProviderOfferHistory"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Provider procurement history, never customer workspace billing data. */
export type ProviderOfferHistory = {
    current_revision: string | null;
    data: (ProviderOfferRevision & {
        is_current: boolean;
    })[];
    has_more: boolean;
    next_before: string | null;
};
```

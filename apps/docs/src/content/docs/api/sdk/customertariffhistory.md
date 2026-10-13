---
title: "CustomerTariffHistory"
description: "Generated TypeScript declaration for CustomerTariffHistory"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerTariffHistory = {
    current_revision: string | null;
    data: CustomerTariffHistoryEntry[];
    has_more: boolean;
    next_before: string | null;
};
```

---
title: "CommercialPosition"
description: "Generated TypeScript declaration for CommercialPosition"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** All rows share one database snapshot and UTC dispatch interval [from, until). */
export type CommercialPosition = {
    currency: string;
    days: number;
    from: string;
    until: string;
    data: CommercialPositionRow[];
};
```

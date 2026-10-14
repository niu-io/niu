---
title: "RetailTextEnrollment"
description: "Generated TypeScript declaration for RetailTextEnrollment"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RetailTextEnrollment = {
    model_alias: string;
    price_id: string | null;
    version: string;
    pricing_source: 'platform' | 'workspace';
    effective_price: RetailSelection | null;
};
```

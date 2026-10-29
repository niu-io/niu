---
title: "RetailMediaEnrollment"
description: "Generated TypeScript declaration for RetailMediaEnrollment"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RetailMediaEnrollment = {
    dimensions: MediaBillingDimensions;
    meter: string;
    price_id: string | null;
    version: string;
    pricing_source: 'platform' | 'workspace';
    effective_price: RetailSelection | null;
};
```

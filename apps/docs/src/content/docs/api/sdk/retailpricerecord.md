---
title: "RetailPriceRecord"
description: "Generated TypeScript declaration for RetailPriceRecord"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RetailPriceRecord = RetailPublicationResult & {
    model_alias: string;
    currency: string;
    schedule: RetailSchedule;
    published_at: string;
    pricing_health?: PlatformPricingHealth;
};
```

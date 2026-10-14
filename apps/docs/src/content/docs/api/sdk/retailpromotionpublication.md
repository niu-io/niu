---
title: "RetailPromotionPublication"
description: "Generated TypeScript declaration for RetailPromotionPublication"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RetailPromotionPublication = {
    baseline_revision: string;
    customer_organization_id: string | null;
    schedule: RetailSchedule;
    effective_from: string;
    effective_until: string;
    expected_version: string;
    idempotency_key: string;
    reason: string;
};
```

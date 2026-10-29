---
title: "RetailPriceHistory"
description: "Generated TypeScript declaration for RetailPriceHistory"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RetailPriceHistory = {
    price_id: string;
    model_alias: string;
    currency: string;
    current_version: string;
    current_revision: string | null;
    next_before: string | null;
    data: Array<{
        revision: string;
        version: string;
        action: 'standard_published' | 'promotion_published' | 'promotion_retired';
        reason: string;
        created_at: string;
        standard_schedule: RetailSchedule | null;
        promotion: {
            baseline_revision: string;
            scope: 'customer' | 'global';
            customer_organization_id: string | null;
            customer_name: string | null;
            effective_from: string;
            effective_until: string;
            schedule: RetailSchedule;
        } | null;
        retirement: {
            promotion_revision: string;
            effective_until: string;
        } | null;
    }>;
};
```

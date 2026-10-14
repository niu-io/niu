---
title: "RetailPromotionPage"
description: "Generated TypeScript declaration for RetailPromotionPage"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Temporal eligibility only; global rules can be overridden for a customer. */
export type RetailPromotionPage = {
    price_id: string;
    model_alias: string;
    currency: string;
    current_version: string;
    as_of: string;
    next_before: string | null;
    data: Array<{
        revision: string;
        version: string;
        created_at: string;
        reason: string;
        baseline_revision: string;
        baseline_version: string;
        baseline_published_at: string;
        original_schedule: RetailSchedule;
        schedule: RetailSchedule;
        scope: 'global' | 'customer';
        customer_organization_id: string | null;
        customer_name: string | null;
        customer_created_at: string | null;
        effective_from: string;
        effective_until: string;
        retirement_effective_until: string | null;
        eligibility_until: string;
        state: 'scheduled' | 'within_period' | 'ended';
    }>;
};
```

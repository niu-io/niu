---
title: "ModelRoutePoolAudit"
description: "Generated TypeScript declaration for ModelRoutePoolAudit"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ModelRoutePoolAudit = {
    alias: string;
    display_name: string | null;
    slug: string;
    billing_mode: ModelRoutePoolBillingMode;
    public_catalog: boolean;
    enabled: boolean;
    revision: number;
    days: number;
    from: string;
    until: string;
    pool_tariff: {
        has_retail_tariff: boolean;
        currency: string | null;
        prompt_rate: string | null;
        completion_rate: string | null;
        has_credits_tariff: boolean;
    };
    totals: {
        observed_attempts: number;
        completed_attempts: number;
        failed_attempts: number;
        customer_charge_nanos: string;
        supplier_cost_nanos: string;
        net_margin_nanos: string;
    };
    findings: Array<{
        severity: 'critical' | 'warning' | 'healthy';
        code: string;
        message: string;
    }>;
    candidates: ModelRoutePoolAuditCandidate[];
};
```

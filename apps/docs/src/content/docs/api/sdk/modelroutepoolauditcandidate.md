---
title: "ModelRoutePoolAuditCandidate"
description: "Generated TypeScript declaration for ModelRoutePoolAuditCandidate"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ModelRoutePoolAuditCandidate = {
    alias: string;
    enabled: boolean;
    priority: number;
    weight: number;
    winning_tier: boolean;
    configured_share_percent: number;
    has_retail_tariff: boolean;
    retail_currency: string | null;
    retail_prompt_rate: string | null;
    retail_completion_rate: string | null;
    has_credits_tariff: boolean;
    qualified_offer_count: number;
    min_supplier_prompt_rate: string | null;
    min_supplier_completion_rate: string | null;
    margin_status: 'healthy' | 'inverted_margin' | 'unpriced_customer' | 'no_qualified_supply';
    observed_attempts: number;
    observed_share_percent: number;
    completed_attempts: number;
    failed_attempts: number;
    avg_duration_ms: number | null;
    p95_duration_ms: number | null;
    customer_charge_nanos: string;
    supplier_cost_nanos: string;
    net_margin_nanos: string;
};
```

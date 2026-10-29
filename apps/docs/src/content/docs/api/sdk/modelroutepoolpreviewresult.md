---
title: "ModelRoutePoolPreviewResult"
description: "Generated TypeScript declaration for ModelRoutePoolPreviewResult"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ModelRoutePoolPreviewResult = {
    pool_alias: string;
    pool_slug: string;
    billing_mode: ModelRoutePoolBillingMode;
    matched_rule: {
        id: string;
        name: string;
    } | null;
    used_default_action: ModelRoutePoolDefaultAction | null;
    eligible_candidates: Array<{
        alias: string;
        priority: number;
        weight: number;
        winning_tier: boolean;
        traffic_share_percent: number;
    }>;
    ineligible_candidates: Array<{
        alias: string;
        reason: 'disabled_in_pool' | 'route_unavailable' | 'capability_or_token_mismatch';
    }>;
};
```

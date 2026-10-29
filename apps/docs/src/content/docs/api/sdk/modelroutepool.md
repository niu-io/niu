---
title: "ModelRoutePool"
description: "Generated TypeScript declaration for ModelRoutePool"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ModelRoutePool = {
    alias: string;
    display_name?: string | null;
    description?: string | null;
    slug?: string;
    organization_id: string | null;
    project_id?: string | null;
    public_catalog?: boolean;
    billing_mode?: ModelRoutePoolBillingMode;
    enabled: boolean;
    revision: number;
    candidates: ModelRoutePoolCandidate[];
    rules?: ModelRoutePoolRule[];
    default_action?: ModelRoutePoolDefaultAction;
};
```

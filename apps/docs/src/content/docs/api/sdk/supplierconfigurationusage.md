---
title: "SupplierConfigurationUsage"
description: "Generated TypeScript declaration for SupplierConfigurationUsage"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface SupplierConfigurationUsage {
    from_ms: number;
    to_ms: number;
    observed_at: string;
    totals: SupplierConfigurationUsageTotals;
    models: Array<SupplierConfigurationUsageTotals & {
        model: string;
    }>;
    next_after: string | null;
}
```

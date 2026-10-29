---
title: "ProviderConfigurationUsage"
description: "Generated TypeScript declaration for ProviderConfigurationUsage"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface ProviderConfigurationUsage {
    from_ms: number;
    to_ms: number;
    observed_at: string;
    totals: ProviderConfigurationUsageTotals;
    models: Array<ProviderConfigurationUsageTotals & {
        model: string;
    }>;
    next_after: string | null;
}
```

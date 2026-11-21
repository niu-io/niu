---
title: "ProviderModel"
description: "Generated TypeScript declaration for ProviderModel"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderModel = {
    alias: string;
    vendor_id: string;
    upstream_model: string;
    public_catalog: boolean;
    enabled: boolean;
    capabilities: Record<string, unknown>;
    pricing: Record<string, unknown> | null;
    revision: number;
};
```

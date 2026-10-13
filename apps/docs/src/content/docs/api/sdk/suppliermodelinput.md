---
title: "SupplierModelInput"
description: "Generated TypeScript declaration for SupplierModelInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type SupplierModelInput = {
    alias: string;
    upstream_model: string;
    public_catalog?: boolean;
    enabled?: boolean;
    capabilities?: Record<string, unknown>;
    /** Omit on update to preserve pricing; null explicitly clears it. */
    pricing?: Record<string, unknown> | null;
    expected_revision?: number;
};
```

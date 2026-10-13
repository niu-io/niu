---
title: "SupplierCredentialUpdateInput"
description: "Generated TypeScript declaration for SupplierCredentialUpdateInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type SupplierCredentialUpdateInput = {
    name: string;
    api_base: string;
    enabled: boolean;
    expected_revision: number;
    /** Omit to retain the existing secret; provide a value to replace it. */
    api_key?: string;
};
```

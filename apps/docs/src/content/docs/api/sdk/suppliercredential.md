---
title: "SupplierCredential"
description: "Generated TypeScript declaration for SupplierCredential"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type SupplierCredential = {
    id: string;
    name: string;
    adapter: string;
    api_base: string;
    enabled: boolean;
    revision: number;
    has_credential: boolean;
    owner_funded: boolean;
    supplier: {
        id: string;
        name: string;
    } | null;
};
```

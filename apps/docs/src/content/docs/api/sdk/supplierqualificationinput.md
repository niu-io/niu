---
title: "SupplierQualificationInput"
description: "Generated TypeScript declaration for SupplierQualificationInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Digests of reviewed private evidence; a digest alone does not establish supply rights. */
export type SupplierQualificationInput = {
    supply_rights_sha256: string;
    supply_capability_sha256: string;
    data_handling_sha256: string;
    valid_until_ms: number;
};
```

---
title: "CustomerUnitDefinition"
description: "Generated TypeScript declaration for CustomerUnitDefinition"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Versioned consumption unit; publication does not activate Credits billing. */
export type CustomerUnitDefinition = {
    revision: string;
    name: string;
    display_precision: number;
    atoms_per_unit: '1000000000';
};
```

---
title: "CustomerUnitBalance"
description: "Generated TypeScript declaration for CustomerUnitBalance"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Exact customer-safe quantities grouped by original unit definition and provenance. */
export type CustomerUnitBalance = {
    billing_mode: 'currency' | 'credits';
    atoms_per_unit: '1000000000';
    balances: Array<{
        definition_revision: string;
        name: string;
        display_precision: number;
        provenance: 'purchased' | 'promotional' | 'simulated';
        issued_atoms: string;
        held_atoms: string;
        charged_atoms: string;
        restored_atoms: string;
        expired_atoms: string;
        available_atoms: string;
    }>;
};
```

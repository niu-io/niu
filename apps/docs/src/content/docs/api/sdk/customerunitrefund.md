---
title: "CustomerUnitRefund"
description: "Generated TypeScript declaration for CustomerUnitRefund"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Immutable original-range restoration, not an external payment refund. */
export type CustomerUnitRefund = {
    id: string;
    credit_atoms: string;
    reason: string;
    atoms_per_unit: '1000000000';
    created_at: string;
    sources: Array<{
        credit_atoms: string;
        definition_revision: string;
        name: string;
        display_precision: number;
        provenance: 'purchased' | 'promotional' | 'simulated';
        expires_at_ms: string | null;
    }>;
};
```

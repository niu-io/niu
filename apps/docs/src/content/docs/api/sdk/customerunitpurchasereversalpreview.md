---
title: "CustomerUnitPurchaseReversalPreview"
description: "Generated TypeScript declaration for CustomerUnitPurchaseReversalPreview"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitPurchaseReversalPreview = {
    order_id: string;
    lot_id: string;
    definition_revision: string;
    name: string;
    display_precision: number;
    atoms_per_unit: '1000000000';
    provenance: 'purchased' | 'simulated';
    payment_currency: string;
    processor_minor_unit_nanos: '10000000';
    payment_nanos: string;
    backing_nanos: string;
    issued_atoms: string;
    held_atoms: string;
    charged_atoms: string;
    restored_atoms: string;
    reversed_atoms: string;
    available_atoms: string;
    available_payment_nanos: string;
    available_backing_nanos: string;
    requested_atoms: string;
    reversible_atoms: string;
    refund_payment_nanos: string;
    refund_backing_nanos: string;
    residual_credit_atoms: string;
    residual_payment_nanos: string;
    residual_backing_nanos: string;
    ranges: CustomerUnitPurchaseReversalRange[];
    reversals: CustomerUnitPurchaseReversal[];
};
```

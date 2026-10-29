---
title: "CustomerUnitPurchaseReversal"
description: "Generated TypeScript declaration for CustomerUnitPurchaseReversal"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitPurchaseReversal = {
    id: string;
    order_id: string;
    lot_id: string;
    definition_revision: string;
    name: string;
    display_precision: number;
    atoms_per_unit: '1000000000';
    provenance: 'purchased' | 'simulated';
    payment_currency: string;
    processor_minor_unit_nanos: '10000000';
    credit_atoms: string;
    refund_payment_nanos: string;
    refund_backing_nanos: string;
    reason: string;
    created_at: string;
    ranges: CustomerUnitPurchaseReversalRange[];
};
```

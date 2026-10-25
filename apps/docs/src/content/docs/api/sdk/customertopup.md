---
title: "CustomerTopup"
description: "Generated TypeScript declaration for CustomerTopup"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Saved customer payment status. IDs are routing references, not display labels. */
export type CustomerTopup = {
    id: string;
    currency: string;
    amount_nanos: string;
    payment_method: string;
    status: 'reconciliation_required' | 'pending' | 'paid' | 'closed';
    checkout_url: string | null;
    /** Original pinned purchase quantity; null for monetary wallet funding. */
    credits?: {
        credit_atoms: string;
        definition_revision: string;
        rule_revision: string;
        name: string;
        display_precision: number;
        atoms_per_unit: '1000000000';
    } | null;
};
```

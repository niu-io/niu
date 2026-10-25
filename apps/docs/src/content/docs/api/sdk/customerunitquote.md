---
title: "CustomerUnitQuote"
description: "Generated TypeScript declaration for CustomerUnitQuote"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** A pinned preview, not a payment, spendable balance or enabled billing mode. */
export type CustomerUnitQuote = {
    id: string;
    rule_revision: string;
    definition_revision: string;
    payment_currency: string;
    payment_nanos: string;
    credit_atoms: string;
    name: string;
    display_precision: number;
    atoms_per_unit: '1000000000';
    numerator: string;
    denominator: string;
    created_at: string;
    expires_at: string;
};
```

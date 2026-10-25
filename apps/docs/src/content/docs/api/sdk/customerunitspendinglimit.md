---
title: "CustomerUnitSpendingLimit"
description: "Generated TypeScript declaration for CustomerUnitSpendingLimit"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitSpendingLimit = {
    unit: {
        definition_revision: string;
        name: string;
        display_precision: number;
        atoms_per_unit: '1000000000';
    } | null;
    limit_atoms: string | null;
    revision: string | null;
    definition_revision: string | null;
    committed_atoms: string;
    remaining_atoms: string | null;
    monetary_limit_preserved: boolean;
    credits_admission_blocked_by_monetary_limit: boolean;
};
```

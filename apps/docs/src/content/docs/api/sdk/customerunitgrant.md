---
title: "CustomerUnitGrant"
description: "Generated TypeScript declaration for CustomerUnitGrant"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Original issuance; not a current remaining balance or a payment receipt. */
export type CustomerUnitGrant = {
    id: string;
    definition_revision: string;
    credit_atoms: string;
    provenance: 'promotional' | 'simulated';
    reason: string;
    expires_at_ms: string | null;
    name: string;
    display_precision: number;
    atoms_per_unit: '1000000000';
    created_at: string;
};
```

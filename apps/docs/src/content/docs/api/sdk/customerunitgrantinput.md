---
title: "CustomerUnitGrantInput"
description: "Generated TypeScript declaration for CustomerUnitGrantInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitGrantInput = {
    definition_revision: string;
    credit_atoms: string;
    provenance: 'promotional' | 'simulated';
    reason: string;
    expires_at_ms?: string | null;
    idempotency_key: string;
};
```

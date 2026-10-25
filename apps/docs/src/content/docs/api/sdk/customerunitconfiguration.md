---
title: "CustomerUnitConfiguration"
description: "Generated TypeScript declaration for CustomerUnitConfiguration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitConfiguration = {
    revision: string;
    billing_mode: 'currency' | 'credits';
    definition: CustomerUnitDefinition | null;
    purchase_rules: CustomerUnitPurchaseRule[];
};
```

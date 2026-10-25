---
title: "CustomerUnitTextTariffInput"
description: "Generated TypeScript declaration for CustomerUnitTextTariffInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitTextTariffInput = Omit<CustomerUnitTextTariff, 'revision'> & {
    expected_revision: string;
    idempotency_key: string;
};
```

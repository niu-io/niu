---
title: "CustomerTariffInput"
description: "Generated TypeScript declaration for CustomerTariffInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerTariffInput = ProviderRateInput & {
    discount_baseline_revision?: string | null;
    minimum_charge_nanos?: string;
    request_fee_nanos?: string;
};
```

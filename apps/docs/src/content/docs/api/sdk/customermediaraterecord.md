---
title: "CustomerMediaRateRecord"
description: "Generated TypeScript declaration for CustomerMediaRateRecord"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform-administrator selling history, with exact amounts and timestamps. */
export type CustomerMediaRateRecord = Omit<ProviderMediaRateRecord, 'card'> & {
    card: ProviderMediaRateRecord['card'] & Pick<CustomerMediaRateCard, 'vendor_id' | 'maximum_quantity' | 'liability_qualification_revision'>;
};
```

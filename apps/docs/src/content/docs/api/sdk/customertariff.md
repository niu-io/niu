---
title: "CustomerTariff"
description: "Generated TypeScript declaration for CustomerTariff"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerTariff = Omit<CustomerTariffInput, 'expected_revision'> & {
    revision: string;
    pricing_source?: 'workspace' | 'platform';
    promotion_scope?: 'global' | 'customer' | null;
    selected_at?: string;
};
```

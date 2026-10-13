---
title: "SupplierMediaRateCard"
description: "Generated TypeScript declaration for SupplierMediaRateCard"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Confidential Supplier purchase card; never submit to customer selling configuration. */
export type SupplierMediaRateCard = Omit<CustomerMediaRateCard, 'vendor_id' | 'maximum_quantity' | 'liability_qualification_revision'>;
```

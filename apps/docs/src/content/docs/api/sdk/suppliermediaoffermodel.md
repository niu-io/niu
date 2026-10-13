---
title: "SupplierMediaOfferModel"
description: "Generated TypeScript declaration for SupplierMediaOfferModel"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Draft media model bindings. Availability and purchase-rate qualification are separate. */
export type SupplierMediaOfferModel = {
    model_alias: string;
    api_key_name: string;
    vendor_id: string;
    vendor_revision: string;
    model_revision: string;
    schema_revision: string;
    channel: string;
    offer_revision: string | null;
};
```

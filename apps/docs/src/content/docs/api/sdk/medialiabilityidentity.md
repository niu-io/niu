---
title: "MediaLiabilityIdentity"
description: "Generated TypeScript declaration for MediaLiabilityIdentity"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Explicit maximum billed quantity evidence; independent of prices and output estimates. */
export type MediaLiabilityIdentity = {
    supplier_id: string;
    offer_id: string;
    offer_revision: string;
    vendor_id: string;
    vendor_revision: string;
    model_alias: string;
    model_revision: string;
    schema_revision: string;
    dimensions: MediaBillingDimensions;
    meter: string;
};
```

---
title: "ProviderMediaOfferInput"
description: "Generated TypeScript declaration for ProviderMediaOfferInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Client-owned immutable receipt; explicitly replay the same document after uncertainty. */
export type ProviderMediaOfferInput = {
    revision: string;
    model_alias: string;
    vendor_id: string;
    vendor_revision: number | string;
    model_revision: number | string;
    schema_revision: string;
    expected_revision: string | null;
};
```

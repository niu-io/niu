---
title: "ProviderMediaRateModel"
description: "Generated TypeScript declaration for ProviderMediaRateModel"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform-administrator current qualified offer bindings for media pricing configuration. */
export type ProviderMediaRateModel = {
    model_alias: string;
    api_key_name: string;
    offer_revision: string;
    vendor_revision: string;
    model_revision: string;
    schema_revision: string;
    channel: string;
    resolutions: string[];
    reference_video: boolean;
};
```

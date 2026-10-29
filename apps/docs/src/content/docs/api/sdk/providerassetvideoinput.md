---
title: "ProviderAssetVideoInput"
description: "Generated TypeScript declaration for ProviderAssetVideoInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** A saved Niu asset ID; upstream type and URI are resolved by the backend. */
export type ProviderAssetVideoInput = {
    type: 'provider_asset';
    provider_asset: {
        id: string;
    };
    role?: string;
};
```

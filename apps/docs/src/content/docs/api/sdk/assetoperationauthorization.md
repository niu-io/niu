---
title: "AssetOperationAuthorization"
description: "Generated TypeScript declaration for AssetOperationAuthorization"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface AssetOperationAuthorization extends Omit<AssetOperationAuthorizationInput, 'valid_for_seconds'> {
    id: string;
    operation: 'CreateAssetGroup' | 'GetAssetGroup' | 'ListAssets' | 'GetAsset' | 'UpdateAssetGroup' | 'DeleteAssetGroup' | 'CreateAsset';
    created_at: string;
    expires_at: string;
    revoked: boolean;
}
```

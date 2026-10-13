---
title: "AssetOperationAuthorizationInput"
description: "Generated TypeScript declaration for AssetOperationAuthorizationInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface AssetOperationAuthorizationInput {
    /** Omitted means creation only; read rights must be reviewed separately. */
    operation?: 'CreateAssetGroup' | 'GetAssetGroup' | 'ListAssets' | 'GetAsset' | 'UpdateAssetGroup' | 'DeleteAssetGroup' | 'CreateAsset';
    organization_id: string;
    project_id: string;
    vendor_revision: number;
    credential_revision: number;
    rights_sha256: string;
    protocol_sha256: string;
    data_handling_sha256: string;
    free_operation_sha256: string;
    valid_for_seconds: number;
}
```

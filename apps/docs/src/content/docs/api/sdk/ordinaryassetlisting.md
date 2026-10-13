---
title: "OrdinaryAssetListing"
description: "Generated TypeScript declaration for OrdinaryAssetListing"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface OrdinaryAssetListing {
    listing_id: string;
    items: Array<{
        name: string;
        status: 'Active' | 'Processing' | 'Failed';
        asset_type: 'Image' | 'Video' | 'Audio';
        created_at: string;
        updated_at: string;
        last_inference_at: string | null;
    }>;
    has_more: boolean;
}
```

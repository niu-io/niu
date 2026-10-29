---
title: "OrdinaryAssetListingAudit"
description: "Generated TypeScript declaration for OrdinaryAssetListingAudit"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface OrdinaryAssetListingAudit {
    listing_id: string;
    previous_listing_id: string | null;
    page_number: number;
    status: 'unresolved' | 'succeeded' | 'failed';
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    reason: string | null;
    item_count: number | null;
    has_more: boolean | null;
}
```

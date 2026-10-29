---
title: "OrdinaryAssetLookupAudit"
description: "Generated TypeScript declaration for OrdinaryAssetLookupAudit"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface OrdinaryAssetLookupAudit {
    lookup_id: string;
    listing_id: string;
    status: 'unresolved' | 'succeeded' | 'failed';
    asset_status: 'Active' | 'Processing' | 'Failed' | null;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    reason: string | null;
}
```

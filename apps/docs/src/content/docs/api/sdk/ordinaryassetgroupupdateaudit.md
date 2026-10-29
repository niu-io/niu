---
title: "OrdinaryAssetGroupUpdateAudit"
description: "Generated TypeScript declaration for OrdinaryAssetGroupUpdateAudit"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface OrdinaryAssetGroupUpdateAudit {
    update_id: string;
    intent_id: string;
    status: 'prepared' | 'unresolved' | 'acknowledged' | 'uncertain' | 'reconciled';
    created_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    reason: string | null;
    patch_status: 'retained' | 'erased' | 'expired';
    reconciliation_required: boolean;
}
```

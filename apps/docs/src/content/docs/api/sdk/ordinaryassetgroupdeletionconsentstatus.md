---
title: "OrdinaryAssetGroupDeletionConsentStatus"
description: "Generated TypeScript declaration for OrdinaryAssetGroupDeletionConsentStatus"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export interface OrdinaryAssetGroupDeletionConsentStatus {
    status: 'consented' | 'expired' | 'revoked' | 'unresolved' | 'acknowledged' | 'uncertain';
    created_at: string;
    expires_at: string;
    reason: string | null;
    duration_ms: number | null;
    dispatch_available: false;
}
```

---
title: "OrdinaryAssetGroupDeletionConsentInput"
description: "Generated TypeScript declaration for OrdinaryAssetGroupDeletionConsentInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Preparation only; no mutation dispatch or automatic retry. */
export interface OrdinaryAssetGroupDeletionConsentInput {
    organization_id: string;
    project_id: string;
    intent_id: string;
    consent_id: string;
    authorization_id: string;
    valid_for_seconds: number;
    confirm_cascade: true;
}
```

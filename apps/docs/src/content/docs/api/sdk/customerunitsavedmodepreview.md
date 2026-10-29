---
title: "CustomerUnitSavedModePreview"
description: "Generated TypeScript declaration for CustomerUnitSavedModePreview"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type CustomerUnitSavedModePreview = {
    id: string;
    expected_revision: string;
    source_mode: 'currency' | 'credits';
    target_mode: 'currency' | 'credits';
    snapshot: CustomerUnitModePreview;
    created_at: string;
    expires_at: string;
};
```

---
title: "ImageReadinessObservation"
description: "Generated TypeScript declaration for ImageReadinessObservation"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ImageReadinessObservation = {
    read_id: string;
    status: 'pending' | 'succeeded' | 'failed';
    asset_status: 'Active' | 'Processing' | 'Failed' | null;
    reason: string | null;
    duration_ms: number | null;
    observed_at: string | null;
    reuse_available: false;
};
```

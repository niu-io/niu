---
title: "MediaAssetObservation"
description: "Generated TypeScript declaration for MediaAssetObservation"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaAssetObservation = {
    source: 'provider_get';
    status: 'processing' | 'active' | 'failed';
    name: string | null;
    observed_at_ms: number;
};
```

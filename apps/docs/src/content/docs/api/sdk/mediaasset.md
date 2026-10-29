---
title: "MediaAsset"
description: "Generated TypeScript declaration for MediaAsset"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaAsset = {
    id: string;
    group_id: string;
    model: string;
    name: string | null;
    kind: 'image' | 'video' | 'audio';
    status: 'pending' | 'processing' | 'active' | 'failed' | 'unknown' | 'deleted';
    observation: MediaAssetObservation | null;
    revision: string;
    created_at_ms: number;
    updated_at_ms: number;
};
```

---
title: "MediaAssetCreateInput"
description: "Generated TypeScript declaration for MediaAssetCreateInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MediaAssetCreateInput = {
    model: string;
    group_id: string;
    name?: string;
    kind: 'image' | 'video' | 'audio';
} & MediaAssetCreateSource;
```

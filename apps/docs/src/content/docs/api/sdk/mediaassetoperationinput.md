---
title: "MediaAssetOperationInput"
description: "Generated TypeScript declaration for MediaAssetOperationInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Full original typed request is required for dispatch; source URLs are not persisted. */
export type MediaAssetOperationInput = {
    action: 'create_group';
    model: string;
    name: string;
    description?: string;
} | {
    action: 'update_group';
    model: string;
    group_id: string;
    name?: string;
    description?: string;
    expected_revision?: string;
} | {
    action: 'delete_group';
    model: string;
    group_id: string;
    expected_revision?: string;
} | {
    action: 'create_asset';
    model: string;
    group_id: string;
    url: string;
    name?: string;
    kind: 'image' | 'video' | 'audio';
} | {
    action: 'rename_asset';
    model: string;
    asset_id: string;
    name: string;
    expected_revision?: string;
} | {
    action: 'delete_asset';
    model: string;
    asset_id: string;
    expected_revision?: string;
};
```

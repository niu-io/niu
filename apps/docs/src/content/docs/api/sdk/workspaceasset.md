---
title: "WorkspaceAsset"
description: "Generated TypeScript declaration for WorkspaceAsset"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/workspace-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceAsset = {
    id: string;
    name: string;
    media_kind: WorkspaceAssetKind;
    content_type: string;
    content_sha256: string;
    byte_length: number;
    revision: string;
    created_at_ms: number;
    updated_at_ms: number;
    /** Only present when the current member may read the source generation. */
    source?: {
        reference: string;
        kind: 'video';
        output: 'video' | 'last_frame';
        model: string;
        created_at: string;
    } | null;
};
```

---
title: "MediaAssetGroup"
description: "Generated TypeScript declaration for MediaAssetGroup"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/media-assets.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Niu workspace references, never raw Provider asset identifiers or Actions. */
export type MediaAssetGroup = {
    id: string;
    model: string;
    name: string;
    description: string | null;
    kind: 'generated' | 'person';
    status: 'pending' | 'ready' | 'unknown' | 'failed' | 'deleted';
    observation: MediaAssetGroupObservation | null;
    revision: string;
    created_at_ms: number;
    updated_at_ms: number;
};
```

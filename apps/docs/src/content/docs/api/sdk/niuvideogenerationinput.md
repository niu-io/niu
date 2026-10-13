---
title: "NiuVideoGenerationInput"
description: "Generated TypeScript declaration for NiuVideoGenerationInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/video-generation.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Niu domain inputs; model-specific capabilities remain server-validated. */
export type NiuVideoGenerationInput = {
    model: string;
    prompt?: string;
    references?: Array<{
        kind: 'image' | 'audio' | 'video';
        url: string;
        role?: string;
        assetId?: never;
    } | {
        assetId: string;
        role?: string;
        kind?: never;
        url?: never;
    }>;
    durationSeconds?: number;
    resolution?: string;
    aspectRatio?: string;
    seed?: number;
    watermark?: boolean;
    cameraFixed?: boolean;
    returnLastFrame?: boolean;
    framesPerSecond?: number;
    /** Additional model-specific controls; cannot override named fields. */
    controls?: Record<string, unknown>;
};
```

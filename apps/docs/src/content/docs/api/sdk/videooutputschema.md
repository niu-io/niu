---
title: "VideoOutputSchema"
description: "Generated TypeScript declaration for VideoOutputSchema"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Optional versioned output mapping inside model capabilities.video_schema. Estimates are not liability bounds. */
export type VideoOutputSchema = {
    observed_frames_per_second?: number;
    allow_unmapped_output?: boolean;
    specifications: Array<{
        resolution: string;
        ratio: string;
        width: number;
        height: number;
    }>;
    estimator: 'SeedancePixelsV1' | 'OutputSecondsV1';
    estimator_revision: string;
};
```

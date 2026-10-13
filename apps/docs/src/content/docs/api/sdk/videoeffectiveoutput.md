---
title: "VideoEffectiveOutput"
description: "Generated TypeScript declaration for VideoEffectiveOutput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoEffectiveOutput = {
    specification: {
        resolution: string;
        ratio: string;
        width: number;
        height: number;
    };
    duration_seconds: number;
    frames_per_second: number | null;
    schema_revision: string;
    estimator: 'SeedancePixelsV1' | 'OutputSecondsV1';
    estimator_revision: string;
};
```

---
title: "VideoJobState"
description: "Generated TypeScript declaration for VideoJobState"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoJobState = {
    id: string;
    object: 'video.job';
    model: string;
    status: 'submission_unknown' | 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'reconciliation_required';
};
```

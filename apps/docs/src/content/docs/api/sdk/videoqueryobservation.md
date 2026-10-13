---
title: "VideoQueryObservation"
description: "Generated TypeScript declaration for VideoQueryObservation"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/video-query-observations.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoQueryObservation = {
    /** Internal continuation reference; never a product label. */
    cursor: string;
    observed_at_ms: number;
    meter: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown';
    quantity: VideoReportedQuantity;
    /** Reported epoch seconds; independent of measured transport spans. */
    provider_times: VideoProviderTimes;
};
```

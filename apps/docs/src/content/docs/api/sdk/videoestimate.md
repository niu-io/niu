---
title: "VideoEstimate"
description: "Generated TypeScript declaration for VideoEstimate"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoEstimate = {
    object: 'video.estimate';
    model: string;
    mode: 'owner_funded' | 'customer';
    effective_output: VideoEffectiveOutput;
    estimate: NonNullable<VideoJobBilling['estimate']>;
    maximum_charge_nanos: string | null;
    selected_at: string | null;
};
```

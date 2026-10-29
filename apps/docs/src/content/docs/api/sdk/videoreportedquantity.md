---
title: "VideoReportedQuantity"
description: "Generated TypeScript declaration for VideoReportedQuantity"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/video-query-observations.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoReportedQuantity = {
    state: 'missing' | 'invalid';
} | {
    state: 'reported';
    value: string;
};
```

---
title: "VideoProviderTimes"
description: "Generated TypeScript declaration for VideoProviderTimes"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/video-query-observations.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoProviderTimes = {
    state: 'missing' | 'invalid';
} | {
    state: 'reported';
    created_at: string;
    updated_at: string;
};
```

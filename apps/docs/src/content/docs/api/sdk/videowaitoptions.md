---
title: "VideoWaitOptions"
description: "Generated TypeScript declaration for VideoWaitOptions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/video-wait.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoWaitOptions = RequestOptions & {
    /** Overall deadline, including requests and sleeps. Default: ten minutes. */
    timeoutMs?: number;
    /** Delay between observations; at least one second. Default: five seconds. */
    intervalMs?: number;
};
```

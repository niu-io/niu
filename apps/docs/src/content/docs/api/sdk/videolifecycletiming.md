---
title: "VideoLifecycleTiming"
description: "Generated TypeScript declaration for VideoLifecycleTiming"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoLifecycleTiming = {
    source: 'gateway_observation';
    submitted_unix_ms: number | null;
    observations: Array<{
        status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown';
        observed_unix_ms: number;
    }>;
    conflicting_terminal: boolean;
};
```

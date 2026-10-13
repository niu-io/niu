---
title: "VideoTransportTimings"
description: "Generated TypeScript declaration for VideoTransportTimings"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Result spans measure upstream retrieval, not client delivery or generation billing. */
export type VideoTransportTimings = {
    /** First gateway observations, not exact Supplier queue/run transitions. */
    lifecycle?: VideoLifecycleTiming;
    data: Array<{
        phase: 'submission' | 'query' | 'result';
        started_unix_ms: number;
        elapsed_ms: number;
        outcome: 'received' | 'unavailable';
        upstream_http_status?: number | null;
        upstream_error_code?: string | null;
        upstream_request_id?: string | null;
    }>;
    has_more: boolean;
};
```

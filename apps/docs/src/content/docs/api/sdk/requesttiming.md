---
title: "RequestTiming"
description: "Generated TypeScript declaration for RequestTiming"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type RequestTiming = {
    dispatch_ms: number | null;
    headers_ms: number | null;
    first_output_ms: number | null;
    total_ms: number;
    complete: boolean;
    http_status: number | null;
};
```

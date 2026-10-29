---
title: "VideoJobHistory"
description: "Generated TypeScript declaration for VideoJobHistory"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type VideoJobHistory = {
    data: Array<VideoJobState & {
        created_at_ms: string;
    }>;
    has_more: boolean;
    next_before: string | null;
};
```

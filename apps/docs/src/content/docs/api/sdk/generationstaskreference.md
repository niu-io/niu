---
title: "GenerationsTaskReference"
description: "Generated TypeScript declaration for GenerationsTaskReference"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationsTaskReference = {
    id: string;
    reference?: string;
    kind: 'video';
    model: string;
    artifacts: Array<{
        task_id: string;
        kind: 'video' | 'last_frame';
        availability: 'available' | 'expired' | 'deleted' | 'unavailable';
    }>;
    status: 'submission_unknown' | 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'reconciliation_required';
};
```

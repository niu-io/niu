---
title: "WorkspaceEvent"
description: "Generated TypeScript declaration for WorkspaceEvent"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceEvent = {
    id: string;
    sequence: string;
    type: 'pool.changed' | 'evaluation.recorded' | 'subscription.test';
    schema_version: 1;
    occurred_at: string;
    resource: {
        kind: 'pool' | 'evaluation' | 'subscription';
        slug: string;
        revision: number;
        run?: string;
    };
};
```

---
title: "WorkspacePoolSelection"
description: "Generated TypeScript declaration for WorkspacePoolSelection"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspacePoolSelection = {
    pool_revision: number;
    selected_model: string;
    created_at: string;
    operation_id: string | null;
    attempt_id: string | null;
    /** Returned HTTP status, not terminal generation or quality acceptance. */
    response_status: number | null;
};
```

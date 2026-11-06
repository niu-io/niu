---
title: "WorkspaceAutoPath"
description: "Generated TypeScript declaration for WorkspaceAutoPath"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** One declared Auto execution path. Candidates reference top-level aliases. */
export type WorkspaceAutoPath = {
    id: string;
    name?: string;
    description?: string;
    response_type: WorkspaceAutoResponseType;
    candidates: string[];
    /** Lowercase caller task keywords that select this path without a model call. */
    task?: string[];
    stage?: string[];
};
```

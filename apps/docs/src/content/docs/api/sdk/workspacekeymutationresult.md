---
title: "WorkspaceKeyMutationResult"
description: "Generated TypeScript declaration for WorkspaceKeyMutationResult"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceKeyMutationResult = {
    id: string;
    token: string;
    secret_available: true;
    key: WorkspaceKeyDetail | null;
} | {
    id: string;
    secret_available: false;
    key: WorkspaceKeyDetail | null;
};
```

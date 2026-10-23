---
title: "WorkspaceKeyRequestStatus"
description: "Generated TypeScript declaration for WorkspaceKeyRequestStatus"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceKeyRequestStatus = {
    data: {
        action: 'create' | 'rotate';
        key: WorkspaceKeyDetail;
    } | null;
};
```

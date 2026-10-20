---
title: "WorkspaceInput"
description: "Generated TypeScript declaration for WorkspaceInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceInput = {
    name: string;
    slug?: string;
    spending_limit?: {
        currency: string;
        limit_nanos: string;
    };
    organization_id?: string | null;
};
```

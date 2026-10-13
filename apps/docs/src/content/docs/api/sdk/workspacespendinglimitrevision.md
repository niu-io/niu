---
title: "WorkspaceSpendingLimitRevision"
description: "Generated TypeScript declaration for WorkspaceSpendingLimitRevision"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceSpendingLimitRevision = {
    currency: string;
    limit_nanos: string;
    revision: string;
    recorded_at: string | null;
    source: 'configuration' | 'migration_baseline';
    actor_kind: 'unknown' | 'installation' | 'member';
    actor_name: string | null;
};
```

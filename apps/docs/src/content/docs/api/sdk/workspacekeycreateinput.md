---
title: "WorkspaceKeyCreateInput"
description: "Generated TypeScript declaration for WorkspaceKeyCreateInput"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Explicit null opts into no automatic expiration; omission is invalid. */
export type WorkspaceKeyCreateInput = {
    name: string;
    ttl_seconds: number | null;
    allowed_models?: string[];
    spending_limit?: Omit<WorkspaceKeySpendingLimitPatch, 'expected_revision'>;
    requests_per_minute?: number | null;
    tokens_per_minute?: number | null;
    max_concurrent_requests?: number | null;
    /** Empty array denies all sources; null or omission leaves sources unrestricted. */
    allowed_cidrs?: string[] | null;
};
```

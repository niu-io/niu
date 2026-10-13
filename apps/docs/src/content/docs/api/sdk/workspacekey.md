---
title: "WorkspaceKey"
description: "Generated TypeScript declaration for WorkspaceKey"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceKey = {
    id: string;
    revision: number;
    name: string;
    allowed_models: string[];
    /** Null means no automatic expiration. */
    expires_at_ms: number | null;
    /** Latest durable dispatch intent; null means no recorded dispatch, not no authentication. */
    last_used_at_ms: number | null;
    revoked: boolean;
    expired: boolean;
};
```

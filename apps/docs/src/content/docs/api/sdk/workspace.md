---
title: "Workspace"
description: "Generated TypeScript declaration for Workspace"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type Workspace = WorkspaceRoute & {
    organization_name: string;
    is_default: boolean;
    created_at_ms: number;
    active_key_count: number;
    requests_30d: number;
    requests_by_day: Array<{
        start_ms: number;
        request_count: number;
    }>;
    last_request_at_ms: number | null;
};
```

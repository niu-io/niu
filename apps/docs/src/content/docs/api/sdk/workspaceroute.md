---
title: "WorkspaceRoute"
description: "Generated TypeScript declaration for WorkspaceRoute"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Authorized identity for a canonical route; never display the routing reference as a name. */
export type WorkspaceRoute = {
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    slug_aliases: string[]; /** @deprecated Use slug. */
    route_slug: string;
};
```

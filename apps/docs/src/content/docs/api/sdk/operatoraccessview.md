---
title: "OperatorAccessView"
description: "Generated TypeScript declaration for OperatorAccessView"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type OperatorAccessView = {
    id: string;
    name: string;
    role: OperatorAccessRole;
    organization_id: string | null;
    project_id: string | null;
    revoked: boolean;
};
```

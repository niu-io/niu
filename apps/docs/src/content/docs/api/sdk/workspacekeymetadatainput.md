---
title: "WorkspaceKeyMetadataInput"
description: "Generated TypeScript declaration for WorkspaceKeyMetadataInput"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type WorkspaceKeyMetadataInput = {
    name: string;
    allowed_models: string[];
    /** Integer metadata revision, distinct from decimal-string policy revisions. */
    expected_revision: number;
};
```

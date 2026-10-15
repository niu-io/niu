---
title: "NiuAdminOptions"
description: "Generated TypeScript declaration for NiuAdminOptions"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type NiuAdminOptions = {
    adminToken: string;
    /** Administration API base; defaults to http://localhost:2555/api/v1. */
    baseURL?: string;
    fetch?: typeof globalThis.fetch;
};
```

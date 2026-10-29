---
title: "ProviderAccount"
description: "Generated TypeScript declaration for ProviderAccount"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderAccount = Omit<ProviderAccountInput, 'credential_reference'> & {
    id: string;
    credential_revision: number;
    health: string;
    refreshing: boolean;
};
```

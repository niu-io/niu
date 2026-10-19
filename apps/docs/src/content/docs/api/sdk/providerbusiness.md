---
title: "ProviderBusiness"
description: "Generated TypeScript declaration for ProviderBusiness"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform-only credential configuration metadata. Secret values are never returned. */
export type ProviderBusiness = {
    id: string;
    name: string;
    api_keys: number;
    models: number;
    members: number;
    /** Enabled saved configurations and mappings; not upstream verification. */
    enabled_api_keys?: number;
    enabled_model_routes?: number;
    qualification_status: 'qualified' | 'unqualified';
};
```

---
title: "ProviderDiscovery"
description: "Generated TypeScript declaration for ProviderDiscovery"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderDiscovery = {
    data: ProviderCatalogModel[];
    discovery: {
        integration: ProviderIntegration;
        inventory_scope: 'credential_filtered' | 'instance_reported';
        credential_access: 'catalog_read_succeeded';
        inference_verified: false;
        management_access: 'not_checked';
        prices: 'advertised_only';
    };
};
```

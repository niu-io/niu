---
title: "ProviderBusiness"
description: "Generated TypeScript declaration for ProviderBusiness"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform-only credential configuration metadata. Secret values are never returned. */
export type ProviderBusiness = {
    slug: string;
    logo_url?: string;
    model_access_mode?: ProviderModelAccessMode;
    default_discount_bps?: number;
    offers?: number;
    ready_offers?: number;
    id: string;
    name: string;
    api_keys: number;
    models: number;
    members: number;
    /** Connections holding a stored non-empty credential (enabled or disabled). */
    configured_api_keys?: number;
    /** Enabled saved configurations and mappings; not upstream verification. */
    enabled_api_keys?: number;
    enabled_model_routes?: number;
    internal_api_keys?: number;
    internal_model_routes?: number;
};
```

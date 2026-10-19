---
title: "ProviderModelCheck"
description: "Generated TypeScript declaration for ProviderModelCheck"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Catalog reachability only; this does not prove inference or billing readiness. */
export type ProviderModelCheck = {
    status: 'connected' | 'credentials_rejected' | 'endpoint_unavailable' | 'private_endpoint_blocked' | 'invalid_endpoint' | 'redirect_blocked' | 'provider_rate_limited' | 'provider_error' | 'model_catalog_unavailable' | 'model_catalog_too_large' | 'invalid_model_catalog';
    model: 'listed' | 'not_listed' | 'unknown';
    http_status: number | null;
    duration_ms: number;
    checked_at_ms: number;
};
```

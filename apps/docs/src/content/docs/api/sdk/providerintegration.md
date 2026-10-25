---
title: "ProviderIntegration"
description: "Generated TypeScript declaration for ProviderIntegration"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Configuration identity only; does not establish upstream capability or pricing. */
export type ProviderIntegration = {
    integration_type: ProviderIntegrationType | null;
    effective_type: ProviderIntegrationType;
    source: 'connection' | 'provider' | 'unspecified';
    revision: number;
};
```

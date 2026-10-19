---
title: "ProviderCatalogMetadata"
description: "Generated TypeScript declaration for ProviderCatalogMetadata"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Platform catalog metadata. Advertised USD/token prices never configure Niu billing. */
export type ProviderCatalogMetadata = {
    name: string | null;
    description: string | null;
    context_length: number | null;
    max_completion_tokens: number | null;
    input_modalities: string[];
    output_modalities: string[];
    supported_parameters?: string[];
    input_price: string | null;
    output_price: string | null;
};
```

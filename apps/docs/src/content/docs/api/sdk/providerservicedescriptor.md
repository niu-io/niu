---
title: "ProviderServiceDescriptor"
description: "Generated TypeScript declaration for ProviderServiceDescriptor"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ProviderServiceDescriptor = {
    id: 'openrouter' | 'fastrouter' | 'babelark' | 'qiniu' | 'deepseek';
    name: string;
    protocol: 'openrouter' | 'openai';
    api_base: string;
    website: string;
    price_support: 'model_catalog' | 'native_ratios' | 'requires_qualification' | 'official_catalog_unqualified' | 'official_markdown' | 'official_page_json';
    price_source: string;
    adapter_version: string;
    capabilities: string[];
    price_currency: string | null;
};
```

---
title: "EmbeddingRequest"
description: "Generated TypeScript declaration for EmbeddingRequest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EmbeddingRequest = {
    model: string;
    input: string | string[];
    encoding_format?: 'float' | 'base64';
    dimensions?: number;
    user?: string;
};
```

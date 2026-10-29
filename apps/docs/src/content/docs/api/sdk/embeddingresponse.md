---
title: "EmbeddingResponse"
description: "Generated TypeScript declaration for EmbeddingResponse"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type EmbeddingResponse = {
    object: 'list' | string;
    data: Array<{
        object?: 'embedding' | string;
        embedding: number[] | string;
        index?: number;
    }>;
    model: string;
    usage?: {
        prompt_tokens: number;
        total_tokens?: number;
        completion_tokens?: number;
    };
};
```

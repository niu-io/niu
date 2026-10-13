---
title: "ResponsesRequest"
description: "Generated TypeScript declaration for ResponsesRequest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesRequest = {
    model: string;
    input: string;
    instructions?: string;
    max_output_tokens?: number;
    temperature?: number;
    top_p?: number;
    metadata?: Record<string, string>;
    user?: string;
    stream?: false;
};
```

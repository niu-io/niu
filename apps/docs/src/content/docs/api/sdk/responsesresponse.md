---
title: "ResponsesResponse"
description: "Generated TypeScript declaration for ResponsesResponse"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesResponse = {
    id: string;
    object: 'response';
    status: 'completed' | 'incomplete';
    model: string;
    output: Array<ResponsesMessage | ResponsesReasoning>;
    usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens?: number;
    };
};
```

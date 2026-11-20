---
title: "ResponsesRequest"
description: "Generated TypeScript declaration for ResponsesRequest"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.3/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesRequest = {
    model: string;
    input: string | ResponsesInputItem[];
    instructions?: string;
    max_output_tokens?: number;
    temperature?: number;
    top_p?: number;
    metadata?: Record<string, string>;
    user?: string;
    tools?: ResponsesTool[];
    tool_choice?: ResponsesToolChoice;
    parallel_tool_calls?: boolean;
    text?: ResponsesTextConfig;
    reasoning?: {
        effort?: 'minimal' | 'low' | 'medium' | 'high';
        summary?: 'auto' | 'concise' | 'detailed';
    };
    truncation?: 'disabled' | 'auto';
    store?: false;
    stream?: false;
};
```

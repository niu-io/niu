---
title: "ChatCompletionRequest"
description: "Generated TypeScript declaration for ChatCompletionRequest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatCompletionRequest = {
    model: string;
    messages: ChatMessage[];
    tools?: ChatFunctionTool[];
    tool_choice?: ChatToolChoice;
    parallel_tool_calls?: boolean;
    response_format?: ChatResponseFormat;
    /** Priced OpenRouter Chat: positive reasoning subset below the total output limit. */
    reasoning?: {
        max_tokens: number;
        exclude?: boolean;
    };
    stream?: false;
    [key: string]: unknown;
};
```

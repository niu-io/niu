---
title: "ChatCompletionResponse"
description: "Generated TypeScript declaration for ChatCompletionResponse"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatCompletionResponse = {
    id: string;
    object: string;
    model: string;
    choices: Array<{
        index: number;
        message: ChatMessage & {
            tool_calls?: ChatToolCall[];
            refusal?: string | null;
        };
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens?: number;
    };
};
```

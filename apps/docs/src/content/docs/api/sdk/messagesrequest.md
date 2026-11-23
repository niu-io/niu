---
title: "MessagesRequest"
description: "Generated TypeScript declaration for MessagesRequest"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Native Anthropic Messages with streaming, client tools, Extended Thinking, cache_control, and unpriced image/document blocks. */
export type MessagesRequest = {
    model: string;
    max_tokens: number;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string | Array<MessagesContentBlock>;
    }>;
    tools?: Array<{
        name: string;
        description?: string;
        input_schema: Record<string, unknown>;
        cache_control?: MessagesCacheControl;
    }>;
    tool_choice?: {
        type: 'auto' | 'any' | 'none';
        disable_parallel_tool_use?: boolean;
    } | {
        type: 'tool';
        name: string;
        disable_parallel_tool_use?: boolean;
    };
    system?: MessagesText;
    thinking?: MessagesThinkingConfig;
    output_config?: {
        effort?: 'low' | 'medium' | 'high' | 'max';
    };
    top_k?: number;
    metadata?: {
        user_id?: string;
    };
    stream?: false;
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
};
```

---
title: "MessagesRequest"
description: "Generated TypeScript declaration for MessagesRequest"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Buffered native text and opted-in client tools; no media or beta features. */
export type MessagesRequest = {
    model: string;
    max_tokens: number;
    messages: Array<{
        role: 'user' | 'assistant';
        content: MessagesText | Array<MessagesTextBlock | MessagesToolUse | MessagesToolResult>;
    }>;
    tools?: Array<{
        name: string;
        description?: string;
        input_schema: Record<string, unknown>;
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
    stream?: false;
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
};
```

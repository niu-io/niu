---
title: "MessagesResponse"
description: "Generated TypeScript declaration for MessagesResponse"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MessagesResponse = {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: Array<{
        type: 'text';
        text: string;
    } | MessagesToolUse>;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence: string | null;
    /** Null categories do not establish zero usage or settled customer charges. */
    usage: {
        input_tokens: number | null;
        output_tokens: number | null;
        cache_creation_input_tokens: number | null;
        cache_read_input_tokens: number | null;
    };
};
```

---
title: "ResponsesInputItem"
description: "Generated TypeScript declaration for ResponsesInputItem"
---

<!-- Generated from the checked-in source. Do not edit this reference by hand. -->

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesInputItem = {
    type?: 'message';
    id?: string;
    status?: 'in_progress' | 'completed' | 'incomplete';
    role: 'user' | 'system' | 'developer' | 'assistant';
    content: string | Array<Record<string, unknown>>;
} | {
    type: 'function_call';
    id?: string;
    call_id: string;
    name: string;
    arguments: string;
    status?: string;
} | {
    type: 'function_call_output';
    id?: string;
    call_id: string;
    output: string;
    status?: string;
} | {
    type: 'reasoning';
    id?: string;
    summary?: unknown[];
    content?: unknown[];
    encrypted_content?: string;
    status?: string;
};
```

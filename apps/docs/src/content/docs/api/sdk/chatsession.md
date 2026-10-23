---
title: "ChatSession"
description: "Generated TypeScript declaration for ChatSession"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatSession = ChatTurn & {
    reference?: string;
    id?: string;
    title?: string;
    createdAt: number;
    turns?: ChatTurn[];
    attachments?: ChatAttachment[];
    settings?: {
        systemPrompt?: string;
        maxTokens?: number;
        temperature?: number;
        logPayloads?: boolean;
    };
};
```

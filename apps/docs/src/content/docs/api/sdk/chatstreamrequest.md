---
title: "ChatStreamRequest"
description: "Generated TypeScript declaration for ChatStreamRequest"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatStreamRequest = Omit<ChatCompletionRequest, 'stream'> & {
    model: string;
    messages: ChatMessage[];
    stream?: true;
};
```

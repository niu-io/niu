---
title: "ChatMessage"
description: "Generated TypeScript declaration for ChatMessage"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatMessage = {
    role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
    content: string | Array<Record<string, unknown>> | null;
    [key: string]: unknown;
};
```

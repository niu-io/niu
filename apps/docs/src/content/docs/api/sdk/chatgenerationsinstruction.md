---
title: "ChatGenerationsInstruction"
description: "Generated TypeScript declaration for ChatGenerationsInstruction"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Legacy Chat turns have read-only derived references and no per-turn saved clock. */
export type ChatGenerationsInstruction = {
    kind: 'chat';
    prompt: string;
    attachments?: Array<{
        name: string;
        type: string;
        content: string;
    }>;
};
```

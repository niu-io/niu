---
title: "ChatGenerationsTurn"
description: "Generated TypeScript declaration for ChatGenerationsTurn"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatGenerationsTurn = {
    id: string;
    kind: 'chat';
    sequence: string;
    created_at: null;
    content_state: 'retained' | 'missing';
    instruction: ChatGenerationsInstruction | null;
    content_expires_at: null;
    branches: ChatGenerationsBranch[];
};
```

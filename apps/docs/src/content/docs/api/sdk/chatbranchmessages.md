---
title: "chatBranchMessages"
description: "Generated TypeScript declaration for chatBranchMessages"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/admin.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Reconstruct completed text exchanges for one comparison branch. */
export declare function chatBranchMessages(turns: readonly ChatTurn[], model: string): Array<{
    role: 'user' | 'assistant';
    content: string;
}>;
```

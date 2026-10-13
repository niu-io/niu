---
title: "ChatGenerationsTaskReference"
description: "Generated TypeScript declaration for ChatGenerationsTaskReference"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-sessions.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatGenerationsTaskReference = {
    id: string;
    kind: 'chat';
    model: string;
    execution: 'not_sent' | 'may_have_executed' | 'confirmed_completed' | 'confirmed_not_executed';
};
```

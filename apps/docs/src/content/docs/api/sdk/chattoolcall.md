---
title: "ChatToolCall"
description: "Generated TypeScript declaration for ChatToolCall"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatToolCall = {
    /** Optional position retained by compatible upstreams, including buffered calls. */
    index?: number;
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
};
```

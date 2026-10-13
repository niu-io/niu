---
title: "ChatToolChoice"
description: "Generated TypeScript declaration for ChatToolChoice"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ChatToolChoice = 'none' | 'auto' | 'required' | {
    type: 'function';
    function: {
        name: string;
    };
};
```

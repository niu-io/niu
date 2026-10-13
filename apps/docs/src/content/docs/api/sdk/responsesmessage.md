---
title: "ResponsesMessage"
description: "Generated TypeScript declaration for ResponsesMessage"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesMessage = {
    id?: string;
    type: 'message';
    role: 'assistant';
    status?: string;
    content: ResponsesOutputText[];
};
```

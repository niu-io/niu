---
title: "ResponsesOutputText"
description: "Generated TypeScript declaration for ResponsesOutputText"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesOutputText = {
    type: 'output_text';
    text: string;
    annotations?: unknown[];
} | {
    type: 'refusal';
    refusal: string;
};
```

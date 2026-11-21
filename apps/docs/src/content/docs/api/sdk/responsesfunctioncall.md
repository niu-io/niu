---
title: "ResponsesFunctionCall"
description: "Generated TypeScript declaration for ResponsesFunctionCall"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/release/0.4/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type ResponsesFunctionCall = {
    id?: string;
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: string;
    status?: string;
};
```

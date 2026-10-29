---
title: "MessagesTextBlock"
description: "Generated TypeScript declaration for MessagesTextBlock"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type MessagesTextBlock = {
    type: 'text';
    text: string;
    cache_control?: {
        type: 'ephemeral';
        ttl?: '5m' | '1h';
    };
};
```

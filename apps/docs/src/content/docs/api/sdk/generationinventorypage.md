---
title: "GenerationInventoryPage"
description: "Generated TypeScript declaration for GenerationInventoryPage"
tableOfContents: false
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/generations-inventory.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type GenerationInventoryPage<T> = {
    data: T[];
    next_cursor: string | null;
    has_more: boolean;
    supported_kinds: [
        'video'
    ];
    complete: true;
};
```

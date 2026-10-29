---
title: "VideoControl"
description: "Generated TypeScript declaration for VideoControl"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
/** Configured video controls, not a quote or admission guarantee. */
export type VideoControl = {
    kind: 'integer';
    minimum: number;
    maximum: number;
    default: number | null;
} | {
    kind: 'choice';
    values: string[];
    default: string | null;
} | {
    kind: 'boolean';
    default: boolean | null;
};
```

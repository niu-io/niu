---
title: "DecisionPropertySchema"
description: "Generated TypeScript declaration for DecisionPropertySchema"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type DecisionPropertySchema = {
    type: DecisionValueType;
    /** Prompt guidance; at most 200 single-line characters. */
    description?: string;
    /** Required for a finite string choice; 1-32 unique values of at most 64 characters. */
    enum?: string[];
    /** Integer or number bound only. */
    minimum?: number;
    maximum?: number;
};
```

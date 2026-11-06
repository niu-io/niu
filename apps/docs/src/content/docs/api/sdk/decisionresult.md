---
title: "DecisionResult"
description: "Generated TypeScript declaration for DecisionResult"
---

Generated from the checked-in source. Do not edit this reference by hand.

[SDK source](https://github.com/niu-io/niu/blob/main/sdks/javascript/src/index.ts). [All SDK types](/docs/api/sdk/).

```typescript
export type DecisionResult = {
    /** Null only for an explicit model abstention, never a missing decision. */
    decision: Record<string, unknown> | null;
    evidence: DecisionEvidence;
};
```
